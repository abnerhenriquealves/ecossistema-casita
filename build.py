import re
import sys
import datetime
import subprocess

def executar_build():
    # 1. Pega a mensagem do commit enviada pelo terminal (ou usa uma padrão)
    mensagem_commit = sys.argv[1] if len(sys.argv) > 1 else "feat: atualizacao do sistema"

    # 2. Ler o js/app.js para extrair e incrementar o número da versão
    caminho_app = "js/app.js"
    with open(caminho_app, "r", encoding="utf-8") as f:
        conteudo_app = f.read()

    match_versao = re.search(r'const APP_VERSION = "v(\d+)\.(\d+)\.(\d+)";', conteudo_app)
    if not match_versao:
        print("❌ Erro: Não foi possível localizar a constante APP_VERSION em js/app.js")
        return

    major, minor, patch = map(int, match_versao.groups())
    novo_patch = patch + 1
    nova_versao = f"v{major}.{minor}.{novo_patch}"

    # 3. Pega a data e hora exatas do sistema
    agora = datetime.datetime.now().strftime("%d/%m/%Y - %H:%M")

    # 4. Atualiza as constantes no js/app.js
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

    # 5. Atualiza o CACHE_NAME no sw.js
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

    # 6. Executa a sequência do Git
    try:
        subprocess.run(["git", "add", "."], check=True)
        subprocess.run(["git", "commit", "-m", f"{mensagem_commit} ({nova_versao})"], check=True)
        subprocess.run(["git", "push"], check=True)
        print("🚀 Código versionado e publicado no GitHub com sucesso!")
    except subprocess.CalledProcessError as err:
        print(f"⚠️ Falha durante a execução do Git: {err}")

if __name__ == "__main__":
    executar_build()