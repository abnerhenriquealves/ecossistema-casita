import re
import sys
from datetime import datetime, timezone, timedelta
import subprocess
import os
import glob


def gerar_projeto_completo():
    """Regenera o arquivo-espelho com todo o código do projeto."""
    exts = ['.html', '.js', '.css', '.json', '.py']

    files = [
        f for f in glob.glob('**/*', recursive=True)
        if os.path.isfile(f)
        and any(f.endswith(e) for e in exts)
        and 'node_modules' not in f
        and '.git' not in f
        and f != 'PROJETO_COMPLETO.txt'
    ]

    with open('PROJETO_COMPLETO.txt', 'w', encoding='utf-8') as saida:
        for f in sorted(files):
            with open(f, 'r', encoding='utf-8', errors='ignore') as arquivo:
                conteudo = arquivo.read()

            saida.write(
                f'=== INICIO_ARQUIVO: {f} ===\n'
                + conteudo
                + f'\n=== FIM_ARQUIVO: {f} ===\n\n'
            )

    print("📦 PROJETO_COMPLETO.txt regenerado com sucesso.")


def executar_build():
    mensagem_commit = (
        sys.argv[1]
        if len(sys.argv) > 1
        else "feat: atualizacao do sistema"
    )

    caminho_app = "js/app.js"

    with open(caminho_app, "r", encoding="utf-8") as f:
        conteudo_app = f.read()

    match_versao = re.search(
        r'const APP_VERSION = "v(\d+)\.(\d+)\.(\d+)";',
        conteudo_app
    )

    if not match_versao:
        print("❌ Erro: Não foi possível localizar a constante APP_VERSION em js/app.js")
        return

    major, minor, patch = map(int, match_versao.groups())
    novo_patch = patch + 1
    nova_versao = f"v{major}.{minor}.{novo_patch}"

    fuso_sp = timezone(timedelta(hours=-3))
    agora = datetime.now(fuso_sp).strftime("%d/%m/%Y - %H:%M")

    conteudo_app = re.sub(
        r'const APP_VERSION = "v[^"]+";',
        f'const APP_VERSION = "{nova_versao}";',
        conteudo_app
    )

    conteudo_app = re.sub(
        r'const APP_BUILD_TIME = "[^"]+";',
        f'const APP_BUILD_TIME = "{agora}";',
        conteudo_app
    )

    with open(caminho_app, "w", encoding="utf-8") as f:
        f.write(conteudo_app)

    caminho_sw = "sw.js"

    with open(caminho_sw, "r", encoding="utf-8") as f:
        conteudo_sw = f.read()

    conteudo_sw = re.sub(
        r"const CACHE_NAME = 'dimdim-v[^']+';",
        f"const CACHE_NAME = 'dimdim-{nova_versao}';",
        conteudo_sw
    )

    with open(caminho_sw, "w", encoding="utf-8") as f:
        f.write(conteudo_sw)

    print(f"✨ Versão incrementada automaticamente: {nova_versao} ({agora})")

    gerar_projeto_completo()

    try:
        subprocess.run(["git", "add", "."], check=True)

        subprocess.run(
            ["git", "commit", "-m", f"{mensagem_commit} ({nova_versao})"],
            check=True
        )

        subprocess.run(["git", "push"], check=True)

        print(f"🚀 Código versionado e publicado no GitHub com sucesso! ({nova_versao})")

    except subprocess.CalledProcessError as err:
        print(f"⚠️ Falha durante a execução do Git: {err}")


if __name__ == "__main__":
    executar_build()
