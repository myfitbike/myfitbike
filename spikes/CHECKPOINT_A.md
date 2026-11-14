# Owner checkpoint A — Bluetooth and world-slice check

About 20 minutes. Use **Google Chrome** on the Mac.

## Before you start

1. Close Tacx Training, Zwift, Rouvy and Garmin Connect, on the Mac **and on your phone**.
   Turn off Bluetooth on the phone if you can. Only one app can control the trainer.
2. If an Edge or a watch has the trainer saved as a sensor, switch that device off.
3. Plug in the Flux 2. Put on the heart-rate strap; wet the electrodes.
4. In Terminal, in the project folder, start the page server:
   ```bash
   cd myfitbike && python3 -m http.server 5180 --bind 127.0.0.1 --directory spikes
   ```

## Part 1 — trainer, strap and cadence sensor

1. Open **http://localhost:5180/ble/index.html** in Chrome. The grey line under the title
   should say "Web Bluetooth available. Secure context: true".
2. Click **Connect trainer…**, choose the Tacx Flux 2 entry, then **Pair**. The line under the
   button shows the firmware version and "FTMS yes/no, FE-C yes/no". Write that line down.
3. Start pedalling gently. POWER, CADENCE (TRAINER) and SPEED should update.
4. FTMS test (if FTMS says yes):
   1. Click **Request control**. The "Control-point responses" box should say
      "request control: success".
   2. Click **Start**.
   3. Click **ERG 150 W**. Pedal at about 80–90 rpm for 30 seconds. Power should settle near
      150 W whatever your cadence. Then change cadence and check it still holds.
   4. Click **SIM grade 5 %**. Within a few seconds pedalling should feel like a hill.
   5. Click **SIM 0 %**. It should get easier again.
5. FE-C test (only if it says FE-C yes; on current firmware it will most likely say no):
   click **FE-C target 150 W**, pedal 30 s, then **FE-C grade 5 %**, then **FE-C grade 0 %**.
6. Click **Connect heart-rate strap…**, choose the strap, Pair. HEART RATE should show.
7. Click **Connect cadence sensor…**, choose the cadence sensor, Pair. Spin the cranks:
   CADENCE (CRANK) should show.
8. Pedal for 2 minutes with all three connected. Watch the "Notification rates" box.
9. Click **Download frame log (JSON)**. Keep the file.

## Part 2 — world slice

1. Open **http://localhost:5180/world/index.html** in Chrome, full screen (Ctrl+Cmd+F),
   on the monitor you will ride on.
2. Use ↑ and ↓ to change power. The rider follows a 5 km loop with a 1 km climb at 6 %.
   Keys 1, 2 and 3 change the camera. Ride the climb once (or jump to it with
   http://localhost:5180/world/index.html?edge=e-south&s=200&power=300).
3. Look at the box in the top-right corner after a minute of riding. Note **fps** and
   **frame ms p95**.

## What to send back

1. The downloaded JSON file.
2. The device line from step 2 (firmware, FTMS yes/no, FE-C yes/no).
3. Did ERG hold about 150 W? Did 5 % feel like a hill within about 2 seconds? (yes / no each)
4. Did all three devices stay connected for the 2 minutes? Anything in red in the log?
5. World slice: fps and p95 from the top-right box, the screen size, and **yes or no on
   the visual style** (plus anything you dislike: too cartoonish, too plain, colours, haze…).
   This is a style probe: placeholder rider, procedural trees and houses, no detail
   textures yet.
6. The answers to the open questions in plan/PROGRESS.md.
