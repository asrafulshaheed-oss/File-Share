# FileShare

Send files and folders between two computers with **one Python script**.
Works on the same Wi-Fi or over the internet with **Pinggy** or **ngrok**.
Just paste an address: the connection type is detected automatically.

```
python file-share.py
```

No installs and no extra packages. Only **Python 3.6+** is needed.

---

## ✨ Features

- 📁 **Any file, any size**: videos, apps, ZIPs, multi-GB files and whole folders
- 📦 **Many files at once**: `upload a.mp4 b.zip "My Photos"` or `upload *.jpg`
- ➕ **Send more anytime**: upload new files while others are still moving
- 🔁 **Both directions at the same time**: download and upload together
- 🤖 **Fully automatic**: detects TCP, HTTP, HTTPS, WebSocket and TLS by itself
- 🔢 **No port changes**: the port in the tunnel address is used automatically
- ✅ **One double-check question per upload**, even for many files
- 📊 **Live progress**: percent, speed and time left
- ⏸️ **Ctrl+Z** cancels a transfer but keeps the connection. **Ctrl+C** quits.
- ♻️ **Resume**: if the connection drops or the tunnel restarts, the transfer continues where it stopped
- 🛡️ **Safe**: every block is checksummed, nothing is overwritten, and free disk space is checked first
- 💻 **Cross-platform**: Windows, macOS, Linux, Android (Termux), iOS (a-Shell / Pythonista)

---

## 🚀 Choose your connection

Pick **one** method and follow only that section.

| Method | Best for |
|---|---|
| [A. Same Wi-Fi (LAN)](#a-same-wi-fi-lan) | Both computers on the same network: fastest |
| [B. Pinggy TCP](#b-pinggy-tcp) | Over the internet: recommended |
| [C. Pinggy HTTP / HTTPS](#c-pinggy-http--https) | Over the internet when TCP is blocked |
| [D. ngrok TCP](#d-ngrok-tcp) | ngrok users with a verified account |
| [E. ngrok HTTP / HTTPS](#e-ngrok-http--https) | ngrok users, small files |

**Who does what**

- 👤 **User 1** runs the tunnel and **sends the address** to User 2.
- 👤 **User 2** puts that address in `file-share.py`.
- Only User 2 edits the file. User 1 changes nothing.

---

### A. Same Wi-Fi (LAN)

**Step 1: User 1 starts the program**
```
python file-share.py
```
The screen shows your LAN IP, for example `192.168.0.113`.

**Step 2: User 1 sends the IP to User 2**

📨 Send `192.168.0.113` to User 2 (WhatsApp, Messenger, email, anything).

**Step 3: User 2 pastes it and runs the program**

Open `file-share.py`, find this line near the top, and put the IP inside the quotes:
```python
PEER_ADDRESS = '192.168.0.113'
```
Save, then run:
```
python file-share.py
```

✅ Done. Both screens show `Connected`.

---

### B. Pinggy TCP

**Step 1: User 1 starts the tunnel and the program**

Terminal 1:
```bash
ssh -p 443 -o ServerAliveInterval=30 -R0:localhost:4444 tcp@a.pinggy.io
```
Terminal 2:
```
python file-share.py
```
Terminal 1 shows a **TCP address** like this:
```
tcp://abcde.a.free.pinggy.link:41234
```

**Step 2: User 1 sends the TCP address to User 2**

📨 Copy the **whole** address, including `tcp://` and the port at the end, and send it to User 2.

**Step 3: User 2 pastes it and runs the program**

Open `file-share.py` and put the address inside the quotes:
```python
PEER_ADDRESS = 'tcp://abcde.a.free.pinggy.link:41234'
```
Save, then run:
```
python file-share.py
```

✅ Done. You don't need to change any port.

> ⏱️ Free Pinggy tunnels last 60 minutes. User 1 restarts the tunnel and sends the **new** address. User 2 types `connect <new address>` in the running program, and the transfer resumes by itself.

---

### C. Pinggy HTTP / HTTPS

**Step 1: User 1 starts the tunnel and the program**

Terminal 1 (no `tcp@` this time):
```bash
ssh -p 443 -o ServerAliveInterval=30 -R0:localhost:4444 a.pinggy.io
```
Terminal 2:
```
python file-share.py
```
Terminal 1 shows **two addresses**:
```
http://abcde.a.free.pinggy.link
https://abcde.a.free.pinggy.link
```

**Step 2: User 1 sends the HTTPS address to User 2**

📨 Send only the **`https://`** one (it's encrypted). Both work, but one is enough.

**Step 3: User 2 pastes it and runs the program**

Open `file-share.py` and put the address inside the quotes:
```python
PEER_ADDRESS = 'https://abcde.a.free.pinggy.link'
```
Save, then run:
```
python file-share.py
```

✅ Done. It switches to full speed automatically.

> ⏱️ The 60-minute limit applies here too. See the note in section B.

---

### D. ngrok TCP

> ngrok's free plan requires a card to be added to your ngrok account before TCP works.

**Step 1: User 1 starts the tunnel and the program**

Terminal 1:
```bash
ngrok tcp 4444
```
Terminal 2:
```
python file-share.py
```
Terminal 1 shows a **Forwarding** line with a **TCP address**:
```
tcp://0.tcp.in.ngrok.io:12345
```

**Step 2: User 1 sends the TCP address to User 2**

📨 Copy the **whole** address, including `tcp://` and the port, and send it to User 2.

**Step 3: User 2 pastes it and runs the program**
```python
PEER_ADDRESS = 'tcp://0.tcp.in.ngrok.io:12345'
```
Save, then run:
```
python file-share.py
```

✅ Done.

---

### E. ngrok HTTP / HTTPS

**Step 1: User 1 starts the tunnel and the program**

Terminal 1:
```bash
ngrok http 4444
```
Terminal 2:
```
python file-share.py
```
Terminal 1 shows a **Forwarding** line with an **HTTPS address**:
```
https://abcd-12-34-56-78.ngrok-free.app
```

**Step 2: User 1 sends the HTTPS address to User 2**

📨 Copy the whole `https://...` address and send it to User 2.

**Step 3: User 2 pastes it and runs the program**
```python
PEER_ADDRESS = 'https://abcd-12-34-56-78.ngrok-free.app'
```
Save, then run:
```
python file-share.py
```

✅ Done.

> ⚠️ ngrok's free plan includes **1 GB of data per month**. For big files, use Pinggy or LAN.

---

## 📤 Sending files

Type `upload` and one or more files or folders. You can also drag them into the terminal.
```
upload movie.mp4
upload movie.mp4 song.mp3 "My Photos"
upload *.jpg
```

The other user gets **one question** for everything in that upload:
```
Incoming 3 items from laptop (2.10 GB total):
   1. movie.mp4      MP4 file            1.42 GB
   2. song.mp3       MP3 file            8.00 MB
   3. My Photos      folder, 120 file(s) 690 MB
Do you want to download them? (y/n):
```

### The double-check rule

| You type | Result |
|---|---|
| `y`, `y` | ✅ Download |
| `n`, `n` | ❌ Refuse |
| `n`, `y`, `y` | ✅ Download |
| `y`, `n`, `n` | ❌ Refuse |
| `y n y n` or `n y n y` | ❌ Refuse (answers kept changing) |

When it's accepted, both sides see live progress:
```
UP 3 items 45.2% 970 MB/2.10 GB 31.4 MB/s ETA 00:37
```

### Sending more while files are moving

- Type `upload` again at any time. The other user gets a **new question** for the new files.
- If a question is already open, the new one waits its turn and appears right after.
- Both users can upload **at the same time**. Downloads and uploads run together.

Files are saved to the **`FileShare Downloads`** folder next to the script.

---

## ⌨️ Commands

| Command | What it does |
|---|---|
| `upload <paths>` | Send one or more files or folders |
| `cancel` or **Ctrl+Z** | Stop **all** running transfers and stay connected |
| `cancel <number>` | Stop just one transfer (numbers come from `status`) |
| `status` | Show the connection and every transfer with its number |
| `connect <address>` | Switch to a new address |
| `exit` or **Ctrl+C** | Quit |

> On iOS there is no Ctrl+Z key, so type `cancel` instead.

---

## 🛠️ Troubleshooting

| Problem | Fix |
|---|---|
| Stuck on `Connecting...` | Check that User 1's tunnel and program are both running, and the address User 2 pasted is complete (with `tcp://` or `https://` and any port). |
| `points to this computer itself` | User 1 pasted their own address. Leave `PEER_ADDRESS = ''` on User 1 and send the address to User 2. |
| `Port 4444 is busy` | Another copy is already running. Close it. |
| LAN won't connect | Allow Python through the firewall, or use Pinggy. |
| `one upload can offer up to 1000` | Put the files in a folder and upload the folder: a folder can hold any number of files. |
| ngrok stopped working | The free 1 GB/month limit was probably reached. Switch to Pinggy. |

---

## 🔒 Security

- Nothing is saved without the receiver's double **yes**.
- Files can never be written outside the download folder.
- Share your tunnel address only with the person you're sending to, and close the tunnel when you're done.

---

## 📋 Requirements

- Python 3.6 or newer: that's it.
- Android: [Termux](https://termux.dev) with `pkg install python openssh`
- iOS: a-Shell or Pythonista
