"""Build the Lily side-by-side demo: desktop left, Ansh's phone right, one-word timeline bar at the bottom."""
import os, subprocess, datetime as dt
from PIL import Image, ImageDraw, ImageFont

HOME = os.path.expanduser("~")
DESK = "/tmp/lily-demo/part1.webm"
PHONE = f"{HOME}/Downloads/ScreenRecording_11-22-2026 16-23-18_1.MP4"
LOGO = "/Users/tanushmahalka/Desktop/Programs/hqads/creat0r/assets/logo.png"
OUT = "/tmp/lily-edit/out"
FONTDIR = next(d for d in [f"{HOME}/Library/Fonts", "/Library/Fonts"] if os.path.exists(f"{d}/SF-Pro-Display-Regular.otf"))
F = lambda w, s: ImageFont.truetype(f"{FONTDIR}/SF-Pro-Display-{w}.otf", s)

def wall(s):  # "16:23:41" -> seconds of day
    h, m, x = map(int, s.split(":")); return h * 3600 + m * 60 + x
DESK_START = wall("16:15:11") - 0.5
PHONE_START = wall("16:23:17")

W, H = 1920, 1080
BLUE, YELLOW, INK = (11, 61, 245), (255, 204, 0), (20, 20, 30)
DX, DY, DW, DH = 68, 40, 1352, 845
PX, PY, PW, PH = 68 + 1352 + 40, 40, 390, 845
BAR_Y = 925
STEPS = ["Brief", "Ideas", "Find", "Outreach", "Negotiate", "Deal", "Review", "Revise", "Approve", "Pay"]

# (desk start, desk end, phone start or None, phone end, output seconds, step, caption)
SEGS = [
    ("16:15:16", "16:15:23", None, None, 3.5, 0, "You send Lily one message"),
    ("16:15:23", "16:16:17", None, None, 7,   1, "Lily reads the event page and drafts 3 ideas"),
    ("16:16:17", "16:16:58", None, None, 6,   1, "Pick an idea"),
    ("16:17:14", "16:17:30", None, None, 5,   1, "Edit the video checklist"),
    ("16:17:40", "16:20:36", None, None, 5.5,   2, "Lily finds and vets creators in India"),
    ("16:23:30", "16:23:48", "16:23:40", "16:24:20", 7,  3, "Add Ansh. Lily DMs him on Instagram"),
    ("16:25:30", "16:26:52", [("16:24:20","16:24:25"),("16:24:31","16:24:40"),("16:24:46","16:26:40")], None, 13, 4, "Ansh asks $450. Lily settles at $340"),
    ("16:26:52", "16:27:12", "16:26:40", "16:27:30", 6,  5, "You approve the deal"),
    ("16:29:21", "16:29:27", "16:27:30", "16:28:15", 3, 6, "Ansh emails his video. Lily watches it"),
    ("STILL:review_still.png", None, "16:28:58", "16:29:20", 8, 6, "No ID card in the video. Lily asks for a reshoot"),
    ("16:29:42", "16:31:25", "16:29:15", "16:31:20", 8,  7, "Ansh sends a new cut"),
    ("16:31:25", "16:34:30", "16:31:20", "16:34:30", 6,  7, "Lily checks every rule again"),
    ("16:34:30", "16:35:30", "16:34:33", "16:35:30", 7,  8, "All 4 rules pass. You approve the video"),
    ("16:35:30", "16:36:31", "16:35:30", "16:36:31", 8,  9, "$340 payment waits for your OK"),
]

def bar(step, caption, speed, path):
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    d.rectangle([0, BAR_Y, W, H], fill=BLUE)
    # thin panel outlines
    d.rounded_rectangle([DX - 1, DY - 1, DX + DW, DY + DH], radius=6, outline=(225, 228, 236), width=2)
    d.rounded_rectangle([PX - 1, PY - 1, PX + PW, PY + PH], radius=6, outline=(225, 228, 236), width=2)
    # left: logo + name
    lg = Image.open(LOGO).convert("L").resize((64, 64)).point(lambda v: 255 if v < 200 else 0)
    img.paste((255, 255, 255), (60, BAR_Y + 46), lg)
    d.text((134, BAR_Y + 50), "lily", font=F("Semibold", 44), fill="white")
    # title
    d.text((W // 2, BAR_Y + 30), "end-to-end agentic creator management", font=F("Regular", 22), fill=(205, 214, 255), anchor="mm")
    # timeline
    x0, x1, y = 290, 1290, BAR_Y + 92
    gap = (x1 - x0) / (len(STEPS) - 1)
    d.line([x0, y - 34, x1, y - 34], fill=(70, 105, 250), width=3)
    if step > 0:
        d.line([x0, y - 34, x0 + gap * step, y - 34], fill=YELLOW, width=3)
    for i, name in enumerate(STEPS):
        cx = x0 + gap * i
        if i < step:
            d.ellipse([cx - 8, y - 42, cx + 8, y - 26], fill=YELLOW)
            d.text((cx, y), name, font=F("Medium", 24), fill="white", anchor="mm")
        elif i == step:
            d.ellipse([cx - 11, y - 45, cx + 11, y - 23], fill=YELLOW, outline="white", width=3)
            d.text((cx, y), name, font=F("Bold", 28), fill=YELLOW, anchor="mm")
        else:
            d.ellipse([cx - 7, y - 41, cx + 7, y - 27], outline=(140, 160, 255), width=2)
            d.text((cx, y), name, font=F("Regular", 24), fill=(150, 168, 255), anchor="mm")
    # right: caption
    cf = F("Medium", 24)
    words, lines, cur = caption.split(), [], ""
    for w_ in words:
        t = (cur + " " + w_).strip()
        if d.textlength(t, font=cf) > 470 and cur: lines.append(cur); cur = w_
        else: cur = t
    lines.append(cur)
    for li, ln in enumerate(lines[-2:]):
        d.text((W - 60, BAR_Y + 48 + li * 32 - (16 if len(lines) == 1 else 0) + 14), ln, font=cf, fill="white", anchor="rm")
    d.text((W - 60, BAR_Y + 122), f"{speed}× speed" if speed > 1 else "", font=F("Regular", 18), fill=(170, 185, 255), anchor="rm")
    img.save(path)

def wrap_caption(c):  # keep caption inside the right column
    return c

def run(cmd):
    subprocess.run(cmd, check=True)

parts = []
for i, (a, b, pa, pb, dur, step, cap) in enumerate(SEGS):
    if a.startswith("STILL:"):
        dspeed = 1
        desk_in = ["-loop", "1", "-t", str(dur), "-i", f"{OUT}/{a[6:]}"]
        desk_f = f"[1:v]fps=30,scale={DW}:{DH},format=yuv420p[d]"
        label_speed = 1
    else:
        da, db_ = wall(a) - DESK_START, wall(b) - DESK_START
        dspeed = (db_ - da) / dur
        desk_in = ["-ss", f"{da:.2f}", "-t", f"{db_ - da:.2f}", "-i", DESK]
        desk_f = f"[1:v]setpts=(PTS-STARTPTS)/{dspeed:.4f},fps=30,scale={DW}:{DH}[d]"
        label_speed = round(dspeed)
    bg = f"{OUT}/bar_{i:02d}.png"; bar(step, cap, label_speed, bg)
    if pa:
        pieces = pa if isinstance(pa, list) else [(pa, pb)]
        ranges = [(wall(x) - PHONE_START, wall(y) - PHONE_START) for x, y in pieces]
        total = sum(y - x for x, y in ranges)
        pspeed = total / dur
        phone_in = ["-i", PHONE]
        chains = "".join(f"[2:v]trim={x:.2f}:{y:.2f},setpts=PTS-STARTPTS[pp{k}];" for k, (x, y) in enumerate(ranges))
        cat = "".join(f"[pp{k}]" for k in range(len(ranges))) + f"concat=n={len(ranges)}:v=1:a=0[pc];"
        phone_f = chains + cat + f"[pc]setpts=PTS/{pspeed:.4f},fps=30,scale={PW}:{PH}[p]"
    else:
        phone_in = ["-loop", "1", "-t", str(dur), "-i", f"{OUT}/phone_first.png"]
        phone_f = f"[2:v]fps=30,scale={PW}:{PH},format=yuv420p[p]"
    out = f"{OUT}/seg_{i:02d}.mp4"
    fc = (f"{desk_f};{phone_f};"
          f"[0:v][d]overlay={DX}:{DY}:eof_action=repeat[t];[t][p]overlay={PX}:{PY}:eof_action=repeat,format=yuv420p[v]")
    run(["ffmpeg", "-y", "-v", "error", "-loop", "1", "-t", str(dur), "-i", bg, *desk_in, *phone_in,
         "-filter_complex", fc, "-map", "[v]", "-t", str(dur), "-r", "30", "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", out])
    parts.append(out)
    print(f"seg {i:02d} {a} desk x{dspeed:.1f} -> {dur}s")

with open(f"{OUT}/list.txt", "w") as f:
    f.writelines(f"file '{p}'\n" for p in parts)
run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", f"{OUT}/list.txt", "-c", "copy", f"{OUT}/lily-demo-side-by-side.mp4"])
print("done")
