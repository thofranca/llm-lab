"""Cria uma venv exclusiva e instala dependências. Execute com Python 3.11/3.12."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys
import venv

ROOT = Path(__file__).resolve().parent

def run(args):
    print('+', ' '.join(map(str, args)), flush=True)
    subprocess.run(list(map(str, args)), cwd=ROOT, check=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cpu', action='store_true', help='Instalar PyTorch CPU em vez de CUDA 12.8')
    args = parser.parse_args()
    if sys.version_info[:2] not in {(3, 11), (3, 12)}:
        raise SystemExit('Use Python 3.11 ou 3.12: py -3.12 setup_project.py')
    env = ROOT / '.venv'
    if not env.exists():
        venv.EnvBuilder(with_pip=True).create(env)
    python = env / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    run([python, '-m', 'pip', 'install', '--upgrade', 'pip'])
    index = 'cpu' if args.cpu else 'cu128'
    run([python, '-m', 'pip', 'install', 'torch==2.7.1', '--index-url',
         'https://download.pytorch.org/whl/' + index])
    run([python, '-m', 'pip', 'install', '-r', ROOT / 'requirements.txt'])
    if not (ROOT / '.env').exists():
        shutil.copyfile(ROOT / '.env.example', ROOT / '.env')
    if not (ROOT / '.git').exists() and shutil.which('git'):
        run(['git', 'init', '-b', 'main'])
    run([python, ROOT / 'doctor.py'])
    print('Instalação concluída. No Windows: .venv\\Scripts\\python.exe run.py')

if __name__ == '__main__':
    main()
