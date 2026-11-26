"""Browser regression checks for animated about-card backgrounds (requires Pillow, Playwright and ffmpeg)."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
import shutil
import re
import subprocess
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

with TemporaryDirectory(prefix="serenity-background-") as directory:
    fixture = Path(directory)
    shutil.copytree(ROOT / "templates/assets/js", fixture / "js")
    images = [Image.new("RGB", (64, 40), color) for color in ("red", "lime", "blue")]
    images[0].save(fixture / "motion.gif", save_all=True, append_images=images[1:], duration=120, loop=0, disposal=2)
    for extension, codec in [("mp4", "libx264"), ("webm", "libvpx-vp9")]:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(fixture / "motion.gif"), "-t", "1.08", "-vf", "format=yuv420p", "-c:v", codec, str(fixture / ("motion." + extension))], check=True)
    background_css = re.search(r"\.aw-background \{[^}]+\}", (ROOT / "templates/assets/css/about-weather.css").read_text(encoding="utf-8")).group(0)
    fixture.joinpath("index.html").write_text("""<!doctype html><html data-theme="light"><style>
    .about-stats {width:min(70vw,600px);height:200px;position:relative} @media(max-width:900px){.about-stats{width:90vw;height:80px}} .stats-bubbles{width:100%;height:100%}
    .about-weather {width:320px;height:160px;position:relative}__BACKGROUND_CSS__
    </style><div class="about-stats"><div class="stats-bubbles"></div>
    <div class="stat-item"><span class="stat-num">32</span><span class="stat-label">posts</span></div></div>
    <section class="about-weather"><img class="aw-background" alt=""></section>
    <script>
    window.cleanups=[];window.__pjaxOnLeave=fn=>cleanups.push(fn);window.gifColors=[];window.videoTimes=[];
    const draw=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(source,...args){
      if(source instanceof HTMLVideoElement){
        videoTimes.push(source.currentTime);
        const [x,y,w,h]=args;
        if(x>.01 || y>.01 || x+w<this.canvas.width-.01 || y+h<this.canvas.height-.01 || Math.abs(w/h-source.videoWidth/source.videoHeight)>.01)throw Error('Statistics video must cover without stretching');
      }
      if(source instanceof HTMLCanvasElement && source.width===64 && source.height===40){
        const pixel=Array.from(source.getContext('2d').getImageData(0,0,1,1).data).join(',');
        if(!gifColors.includes(pixel))gifColors.push(pixel);
      }
      return draw.call(this,source,...args);
    };
    const file=new URLSearchParams(location.search).get('file');
    document.querySelector('.stats-bubbles').dataset.background=file;
    document.querySelector('.aw-background').src=file;
    </script><script type="module" src="js/about-background.js"></script>
    <script type="module" src="js/about-stats.js"></script></html>""".replace("__BACKGROUND_CSS__", background_css), encoding="utf-8")
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=directory))
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(channel="msedge", headless=True, args=["--enable-unsafe-swiftshader"])
            for mobile in [False, True]:
                context = browser.new_context(viewport={"width":390 if mobile else 1100,"height":850}, is_mobile=mobile, has_touch=mobile)
                for extension in ["gif", "mp4", "webm"]:
                    page = context.new_page()
                    errors=[]
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.on("console", lambda message: errors.append(message.text) if any(term in message.text for term in ["INVALID_VALUE", "INVALID_OPERATION", "GL_INVALID", "Texture dimensions"]) else None)
                    page.goto(f"http://127.0.0.1:{server.server_port}/?file=motion.{extension}")
                    page.wait_for_function("document.querySelector('.about-stats').classList.contains('has-liquid-lens')", timeout=15000)
                    if extension == "gif":
                        page.wait_for_function("gifColors.length >= 3", timeout=8000)
                        assert page.locator("img.aw-background").count()==1
                    else:
                        page.wait_for_function("new Set(videoTimes).size > 3 && document.querySelector('video.aw-background')?.currentTime > .1", timeout=10000)
                        assert page.locator("video.aw-background").evaluate("v=>v.muted && v.loop && v.playsInline")
                        assert page.locator("video.aw-background").evaluate("""v=>{
                          const box=v.getBoundingClientRect(), parent=v.parentElement.getBoundingClientRect(), css=getComputedStyle(v);
                          return Math.abs(box.width-parent.width)<1 && Math.abs(box.height-parent.height)<1 && css.objectFit==='cover' && css.objectPosition==='50% 50%';
                        }""")
                        page.evaluate("window.backgroundVideo=document.querySelector('video.aw-background'); window.backgroundVideo.scrollIntoView()")
                    # Rapidly cross the breakpoint in both directions without reloading.
                    for width in [1100, 390, 1200, 420, 1000, 390]:
                        page.set_viewport_size({"width":width,"height":850})
                        page.wait_for_timeout(70)
                    page.locator('.stats-bubbles').scroll_into_view_if_needed()
                    if extension != "gif":
                        page.evaluate("window.videoTimes=[]")
                        page.wait_for_function("new Set(videoTimes).size > 3", timeout=8000)
                    page.wait_for_function("""() => {
                      const c=document.querySelector('.stats-bubbles canvas'), b=c.parentElement.getBoundingClientRect();
                      return c.width===Math.floor(b.width*Math.min(2,devicePixelRatio)) && c.height===Math.floor(b.height*Math.min(2,devicePixelRatio));
                    }""", timeout=5000)
                    assert not errors, errors
                    page.evaluate("cleanups.forEach(fn=>fn())")
                    assert page.locator(".stats-bubbles canvas").count()==0
                    if extension != "gif":
                        assert page.evaluate("backgroundVideo.paused && !backgroundVideo.hasAttribute('src')")
                    # Simulate returning through PJAX: the module stays cached, the DOM is new.
                    page.evaluate("""() => {
                      const stats=document.querySelector('.stats-bubbles');delete stats.dataset.ready;
                      const old=document.querySelector('.aw-background');const image=document.createElement('img');
                      image.className='aw-background';image.src=new URLSearchParams(location.search).get('file');old.replaceWith(image);
                      window.gifColors=[];window.videoTimes=[];window.cleanups=[];
                      __pjaxPageInit.forEach(fn=>fn());
                    }""")
                    if extension == "gif":
                        page.wait_for_function("gifColors.length >= 3", timeout=8000)
                    else:
                        page.wait_for_function("new Set(videoTimes).size > 3 && document.querySelector('video.aw-background')?.currentTime > .1", timeout=10000)
                    assert not errors, errors
                    page.evaluate("cleanups.forEach(fn=>fn())")
                    print(f"PASS: {'mobile' if mobile else 'desktop'} {extension}: animated statistics, weather media, cleanup, PJAX return")
                    page.close()
                context.close()
            browser.close()
    finally:
        server.shutdown()
