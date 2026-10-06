"""Servidor independente: uma captura por vez, com cancelamento cooperativo."""
import asyncio
import json
import logging
import queue
import threading
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

load_dotenv(Path(__file__).resolve().parents[1] / '.env')
from .engine import CaptureRequest, Engine

app = FastAPI(title="LLM Lab — instrumentação real")
static = Path(__file__).with_name("static")
app.mount('/static', StaticFiles(directory=static), name='static')
engine = Engine()
lock = threading.Lock()
logger = logging.getLogger(__name__)


class Generation(BaseModel):
    message: str = Field(min_length=1, max_length=1500)
    max_tokens: int = Field(default=32, ge=1, le=128)
    think: bool = False
    attention: bool = True
    attention_layer: int = Field(default=0, ge=0, le=200)
    attention_head: int = Field(default=0, ge=0, le=256)
    temperature: float = Field(default=0.6, ge=0, le=1.5, allow_inf_nan=False)
    seed: int = Field(default=42, ge=0, le=2147483647)

    @field_validator('message')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('Digite uma pergunta.')
        return value.strip()


@app.get('/')
def index():
    return FileResponse(static / 'index.html')


@app.get('/api/info')
def info():
    return {'model': engine.model_id, 'loaded': engine.model is not None,
            'busy': lock.locked(), 'adapter': 'qwen3', 'max_prompt_tokens': 256}


@app.post('/api/generate')
async def generate(body: Generation, request: Request):
    if not lock.acquire(blocking=False):
        raise HTTPException(409, 'Uma captura já está em andamento. Aguarde sua conclusão.')
    stopped = threading.Event()
    messages = queue.Queue(maxsize=4)

    def put(item):
        while not stopped.is_set():
            try:
                messages.put(item, timeout=.2)
                return
            except queue.Full:
                pass

    def worker():
        iterator = None
        try:
            iterator = engine.stream(CaptureRequest(**body.model_dump()), stopped)
            for item in iterator:
                if stopped.is_set():
                    break
                put(item)
        except Exception as exc:
            logger.exception('Falha de captura')
            put({'type': 'error', 'message': str(exc)})
        finally:
            try:
                if iterator is not None:
                    iterator.close()
            finally:
                lock.release()
                put(None)

    thread = threading.Thread(target=worker, daemon=True)
    try:
        thread.start()
    except Exception:
        lock.release()
        raise

    async def events():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    item = await asyncio.to_thread(messages.get, True, .2)
                except queue.Empty:
                    continue
                if item is None:
                    break
                yield json.dumps(item, ensure_ascii=False, allow_nan=False) + '\n'
        finally:
            # Uma operação CUDA/carregamento em curso termina antes de o worker liberar o lock.
            stopped.set()

    return StreamingResponse(events(), media_type='application/x-ndjson',
                             headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})
