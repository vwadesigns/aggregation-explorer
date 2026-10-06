"""Build the portable HTML from the editable source. Python standard library only."""
from pathlib import Path
root=Path(__file__).resolve().parent
text=(root/'src/shell.html').read_text(encoding='utf-8')
for name, filename in [('STYLE','style.css'),('CORE','core.js'),('GPU','gpu.js'),('WORKER','worker.js'),('PNG','png.js'),('APP','app.js')]:
    text=text.replace('/*__'+name+'__*/',(root/'src'/filename).read_text(encoding='utf-8'))
(root/'Aggregation_Explorer.html').write_text(text,encoding='utf-8')
print('Built Aggregation_Explorer.html')
