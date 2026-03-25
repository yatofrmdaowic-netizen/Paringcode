const fs = require("fs");
const readline = require("readline");
const pino = require("pino");
const chalk = require("chalk");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

/* INPUT */

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (text) =>
  new Promise((resolve) => rl.question(text, resolve));

/* START */

async function connectToWhatsApp() {

  const { state, saveCreds } = await useMultiFileAuthState("./session");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    browser: ["Ubuntu", "Chrome", "20.0.04"],

    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(
        state.keys,
        pino({ level: "silent" })
      )
    }
  });

  // PAIRING
  if (!sock.authState.creds.registered) {
    console.log("\n🔥 Pairing Mode\n");

    let phoneNumber = await question("Enter number: ");
    phoneNumber = phoneNumber.replace(/[^0-9]/g, "");

    const code = await sock.requestPairingCode(phoneNumber);
    console.log("\n🔑 Code:", code, "\n");
  }

  // SAVE CREDS
  sock.ev.on("creds.update", saveCreds);

  // CONNECTION
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("✅ Connected");

      const jid = sock.user.id;

      // Send message
      await sock.sendMessage(jid, {
        text: "🔥 Bot connected & sending creds.json"
      });

      // Send creds.json
      const path = "./session/creds.json";

      if (fs.existsSync(path)) {
        await sock.sendMessage(jid, {
          document: fs.readFileSync(path),
          mimetype: "application/json",
          fileName: "creds.json"
        });
      }
    }

    if (connection === "close") {
      const reconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log("❌ Disconnected");

      if (reconnect) setTimeout(connectToWhatsApp, 5000);
    }
  });

}

connectToWhatsApp();
