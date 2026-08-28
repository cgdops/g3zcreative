from playwright.sync_api import sync_playwright
import os
from PIL import Image

svg_path = os.path.join('images', 'g-brand-primary.svg')
with open(svg_path, 'r', encoding='utf-8') as f:
    svg_content = f.read()

html = f"""<!DOCTYPE html>
<html>
<head>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{
      width: 512px;
      height: 512px;
      background-color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }}
    .icon-wrapper {{
      width: 320px;
      height: 320px;
      display: flex;
      align-items: center;
      justify-content: center;
    }}
    svg {{
      width: 100%;
      height: 100%;
      display: block;
    }}
  </style>
</head>
<body>
  <div class="icon-wrapper">
    {svg_content}
  </div>
</body>
</html>"""

temp_html = os.path.abspath('temp_icon_render.html')
with open(temp_html, 'w', encoding='utf-8') as f:
    f.write(html)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 512, 'height': 512})
    page.goto('file:///' + temp_html.replace('\\', '/'))
    
    # Save 512x512
    raw_512 = os.path.abspath('temp_512.png')
    page.screenshot(path=raw_512, clip={'x': 0, 'y': 0, 'width': 512, 'height': 512})
    browser.close()

if os.path.exists(temp_html):
    os.remove(temp_html)

# Now use Pillow to output exact standard sizes
img = Image.open(raw_512).convert('RGB')

# 1. apple-touch-icon.png (180x180 and 512x512)
img.resize((180, 180), Image.Resampling.LANCZOS).save('apple-touch-icon.png', 'PNG')
img.resize((180, 180), Image.Resampling.LANCZOS).save(os.path.join('images', 'apple-touch-icon.png'), 'PNG')
img.resize((180, 180), Image.Resampling.LANCZOS).save(os.path.join('images', 'apple-touch-icon-180x180.png'), 'PNG')

# 2. webclip.png (Standard Webflow webclip 256x256)
img.resize((256, 256), Image.Resampling.LANCZOS).save(os.path.join('images', 'webclip.png'), 'PNG')

# 3. favicon.png (64x64) and favicon.ico
img.resize((64, 64), Image.Resampling.LANCZOS).save(os.path.join('images', 'favicon.png'), 'PNG')
img.resize((32, 32), Image.Resampling.LANCZOS).save('favicon.ico', format='ICO')

# 4. PWA manifest icons
img.resize((192, 192), Image.Resampling.LANCZOS).save(os.path.join('images', 'icon-192.png'), 'PNG')
img.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join('images', 'icon-512.png'), 'PNG')

if os.path.exists(raw_512):
    os.remove(raw_512)

print('All apple-touch-icon, webclip, and favicon assets generated successfully with Pink G on White background!')