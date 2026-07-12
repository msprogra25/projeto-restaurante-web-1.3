import re
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

import models
from auth import gerar_senha_temporaria, verificar_senha

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")


def valid_email(email: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email or ""))


@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(FRONTEND_DIR, path)


@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    senha = data.get("senha") or ""
    tipo = data.get("tipo") or ""

    if tipo not in ("vendedor", "motoqueiro"):
        return jsonify({"ok": False, "erro": "Tipo de conta inválido."}), 400
    if not valid_email(email):
        return jsonify({"ok": False, "erro": "Informe um e-mail válido."}), 400
    if not senha:
        return jsonify({"ok": False, "erro": "Informe a senha."}), 400

    conta = models.buscar_por_email(email, tipo)
    if not conta:
        return jsonify({"ok": False, "erro": "Nenhum cadastro encontrado com esse e-mail."}), 401
    if not verificar_senha(senha, conta["senha_hash"]):
        return jsonify({"ok": False, "erro": "Senha incorreta."}), 401

    return jsonify({"ok": True, "nome": conta["nome"], "email": conta["email"], "tipo": conta["tipo"]})


@app.post("/api/esqueci-senha")
def esqueci_senha():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    tipo = data.get("tipo") or ""

    if tipo not in ("vendedor", "motoqueiro"):
        return jsonify({"registrado": False, "mensagem": "Tipo de conta inválido."}), 400
    if not valid_email(email):
        return jsonify({"registrado": False, "mensagem": "Informe um e-mail válido."}), 400

    conta = models.buscar_por_email(email, tipo)
    if not conta:
        return jsonify({"registrado": False, "mensagem": "E-mail não registrado"})

    nova_senha = gerar_senha_temporaria()
    models.atualizar_senha(email, tipo, nova_senha)
    return jsonify({
        "registrado": True,
        "senha": nova_senha,
        "mensagem": f"Sua nova senha é: {nova_senha}",
        "nome": conta["nome"],
    })


@app.get("/api/contas")
def listar_contas():
    tipo = request.args.get("tipo") or ""
    if tipo not in ("vendedor", "motoqueiro"):
        return jsonify({"erro": "Tipo de conta inválido."}), 400
    return jsonify({"contas": models.listar_contas(tipo)})


@app.get("/api/contas/existe")
def conta_existe():
    tipo = request.args.get("tipo") or ""
    if tipo not in ("vendedor", "motoqueiro"):
        return jsonify({"existe": False}), 400
    total = len(models.listar_contas(tipo))
    return jsonify({"existe": total > 0})


@app.post("/api/contas")
def criar_conta():
    data = request.get_json(silent=True) or {}
    nome = (data.get("nome") or "").strip()
    email = (data.get("email") or "").strip().lower()
    senha = data.get("senha") or ""
    tipo = data.get("tipo") or ""

    if tipo not in ("vendedor", "motoqueiro"):
        return jsonify({"ok": False, "erro": "Tipo de conta inválido."}), 400
    if not nome or not email or not senha:
        return jsonify({"ok": False, "erro": "Preencha todos os campos."}), 400
    if not valid_email(email):
        return jsonify({"ok": False, "erro": "Informe um e-mail válido."}), 400
    if len(senha) < 4:
        return jsonify({"ok": False, "erro": "A senha deve ter pelo menos 4 caracteres."}), 400

    try:
        models.criar_conta(nome, email, senha, tipo)
    except ValueError as exc:
        return jsonify({"ok": False, "erro": str(exc)}), 400

    return jsonify({"ok": True, "nome": nome, "email": email})


@app.put("/api/contas/<email>")
def editar_conta(email):
    data = request.get_json(silent=True) or {}
    tipo = data.get("tipo") or ""
    nome = data.get("nome")
    email_novo = data.get("email_novo")
    senha = data.get("senha")

    if tipo not in ("vendedor", "motoqueiro"):
        return jsonify({"ok": False, "erro": "Tipo de conta inválido."}), 400
    if email_novo and not valid_email(email_novo):
        return jsonify({"ok": False, "erro": "Informe um e-mail válido."}), 400
    if senha is not None and senha != "" and len(senha) < 4:
        return jsonify({"ok": False, "erro": "A senha deve ter pelo menos 4 caracteres."}), 400

    try:
        models.atualizar_conta(
            email,
            tipo,
            nome=nome.strip() if nome else None,
            email_novo=email_novo.strip().lower() if email_novo else None,
            senha=senha if senha else None,
        )
    except ValueError as exc:
        return jsonify({"ok": False, "erro": str(exc)}), 400

    conta = models.buscar_por_email((email_novo or email).lower(), tipo)
    return jsonify({"ok": True, "nome": conta["nome"], "email": conta["email"]})


@app.put("/api/contas/<email>/senha")
def definir_senha(email):
    data = request.get_json(silent=True) or {}
    tipo = data.get("tipo") or ""
    senha = data.get("senha") or ""

    if tipo not in ("vendedor", "motoqueiro"):
        return jsonify({"ok": False, "erro": "Tipo de conta inválido."}), 400
    if not senha or len(senha) < 4:
        return jsonify({"ok": False, "erro": "A senha deve ter pelo menos 4 caracteres."}), 400

    try:
        models.atualizar_senha(email, tipo, senha)
    except ValueError as exc:
        return jsonify({"ok": False, "erro": str(exc)}), 400

    conta = models.buscar_por_email(email, tipo)
    return jsonify({"ok": True, "nome": conta["nome"], "email": conta["email"], "senha": senha})


@app.delete("/api/contas/<email>")
def excluir_conta(email):
    tipo = request.args.get("tipo") or ""
    if tipo not in ("vendedor", "motoqueiro"):
        return jsonify({"ok": False, "erro": "Tipo de conta inválido."}), 400

    try:
        models.excluir_conta(email, tipo)
    except ValueError as exc:
        return jsonify({"ok": False, "erro": str(exc)}), 400

    return jsonify({"ok": True})


if __name__ == "__main__":
    models.init_db()
    print("BRASA rodando em http://localhost:5000")
    print("Login vendedor: vendedor@gmail.com / 1234")
    app.run(host="0.0.0.0", port=5000, debug=False)
