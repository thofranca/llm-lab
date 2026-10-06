import json
from fastapi.testclient import TestClient
from app import main

class FakeEngine:
    model_id='test-double'
    model=None
    def stream(self, req, stop):
        yield {'type':'status','message':'teste'}
        yield {'type':'done','generated_tokens':1}


def test_routes_stream_and_validation(monkeypatch):
    monkeypatch.setattr(main,'engine',FakeEngine())
    with TestClient(main.app) as client:
        assert client.get('/').status_code==200
        assert client.get('/static/app.js').status_code==200
        assert client.get('/api/info').json()['model']=='test-double'
        assert client.post('/api/generate',json={'message':'  '}).status_code==422
        response=client.post('/api/generate',json={'message':'oi'})
        rows=[json.loads(x) for x in response.text.splitlines()]
        assert rows[-1]['type']=='done'
        assert not main.lock.locked()
        main.lock.acquire()
        try:assert client.post('/api/generate',json={'message':'oi'}).status_code==409
        finally:main.lock.release()


def test_failure_releases_lock(monkeypatch):
    class BadEngine(FakeEngine):
        def stream(self, req, stop):
            yield {'type':'status','message':'teste'}
            raise ValueError('erro de teste')
    monkeypatch.setattr(main,'engine',BadEngine())
    with TestClient(main.app) as client:
        response=client.post('/api/generate',json={'message':'oi'})
        assert 'erro de teste' in response.text
        assert not main.lock.locked()
