from pathlib import Path

src = Path(__file__).parent / "restaurante (1).html"
text = src.read_text(encoding="utf-8")

s = text.find("<style>") + len("<style>")
e = text.find("</style>")
css = text[s:e].strip()

body_start = text.find("<body>") + len("<body>")
script_start = text.find("<script>")
script_end = text.rfind("</script>")
body_html = text[body_start:script_start].strip()
script = text[script_start + len("<script>") : script_end].strip()

base = Path(__file__).parent / "frontend"
(base / "css").mkdir(parents=True, exist_ok=True)
(base / "js").mkdir(parents=True, exist_ok=True)
(base / "css" / "styles.css").write_text(css, encoding="utf-8")
(base / "js" / "app.js").write_text(script, encoding="utf-8")

head = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BRASA — Peça já</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;0,9..144,900;1,9..144,500&family=Work+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/styles.css">
</head>
<body>
"""
tail = """
<script src="js/api.js"></script>
<script src="js/app.js"></script>
</body>
</html>
"""
(base / "index.html").write_text(head + body_html + tail, encoding="utf-8")
print("Extracted:", len(css), len(script), len(body_html))
