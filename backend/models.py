import sqlite3
from pathlib import Path

from auth import hash_senha

DB_PATH = Path(__file__).resolve().parent / "brasa.db"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                senha_hash TEXT NOT NULL,
                tipo TEXT NOT NULL CHECK(tipo IN ('vendedor', 'motoqueiro'))
            )
            """
        )
        conn.commit()

        cur = conn.execute("SELECT COUNT(*) AS total FROM usuarios WHERE tipo = 'vendedor'")
        if cur.fetchone()["total"] == 0:
            conn.execute(
                """
                INSERT INTO usuarios (nome, email, senha_hash, tipo)
                VALUES (?, ?, ?, 'vendedor')
                """,
                ("Vendedor", "vendedor@gmail.com", hash_senha("1234")),
            )
            conn.commit()
    finally:
        conn.close()


def listar_contas(tipo: str):
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT id, nome, email, tipo FROM usuarios WHERE tipo = ? ORDER BY nome",
            (tipo,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def buscar_por_email(email: str, tipo: str | None = None):
    conn = get_connection()
    try:
        if tipo:
            row = conn.execute(
                "SELECT * FROM usuarios WHERE email = ? AND tipo = ?",
                (email.lower(), tipo),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT * FROM usuarios WHERE email = ?",
                (email.lower(),),
            ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def contar_vendedores() -> int:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT COUNT(*) AS total FROM usuarios WHERE tipo = 'vendedor'"
        ).fetchone()
        return row["total"]
    finally:
        conn.close()


def criar_conta(nome: str, email: str, senha: str, tipo: str):
    conn = get_connection()
    try:
        conn.execute(
            """
            INSERT INTO usuarios (nome, email, senha_hash, tipo)
            VALUES (?, ?, ?, ?)
            """,
            (nome, email.lower(), hash_senha(senha), tipo),
        )
        conn.commit()
    except sqlite3.IntegrityError as exc:
        raise ValueError("Já existe uma conta com esse e-mail.") from exc
    finally:
        conn.close()


def atualizar_conta(email_atual: str, tipo: str, nome: str | None = None, email_novo: str | None = None, senha: str | None = None):
    conn = get_connection()
    try:
        conta = buscar_por_email(email_atual, tipo)
        if not conta:
            raise ValueError("Conta não encontrada.")

        if email_novo and email_novo.lower() != email_atual.lower():
            dup = buscar_por_email(email_novo.lower())
            if dup:
                raise ValueError("Esse e-mail já está em uso por outra conta.")

        campos = []
        valores = []
        if nome is not None:
            campos.append("nome = ?")
            valores.append(nome)
        if email_novo is not None:
            campos.append("email = ?")
            valores.append(email_novo.lower())
        if senha is not None:
            campos.append("senha_hash = ?")
            valores.append(hash_senha(senha))

        if not campos:
            return

        valores.extend([email_atual.lower(), tipo])
        conn.execute(
            f"UPDATE usuarios SET {', '.join(campos)} WHERE email = ? AND tipo = ?",
            valores,
        )
        conn.commit()
    except sqlite3.IntegrityError as exc:
        raise ValueError("Esse e-mail já está em uso por outra conta.") from exc
    finally:
        conn.close()


def atualizar_senha(email: str, tipo: str, senha: str):
    conn = get_connection()
    try:
        cur = conn.execute(
            "UPDATE usuarios SET senha_hash = ? WHERE email = ? AND tipo = ?",
            (hash_senha(senha), email.lower(), tipo),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise ValueError("Conta não encontrada.")
    finally:
        conn.close()


def excluir_conta(email: str, tipo: str):
    conn = get_connection()
    try:
        if tipo == "vendedor" and contar_vendedores() <= 1:
            raise ValueError("Não é possível excluir: precisa existir pelo menos uma conta de vendedor.")

        cur = conn.execute(
            "DELETE FROM usuarios WHERE email = ? AND tipo = ?",
            (email.lower(), tipo),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise ValueError("Conta não encontrada.")
    finally:
        conn.close()
