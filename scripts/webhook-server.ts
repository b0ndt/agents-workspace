import "dotenv/config";
import { createServer } from "http";
import { createHmac } from "crypto";

const PORT = parseInt(process.env.WEBHOOK_PORT || "3847", 10);
const SECRET = process.env.WEBHOOK_SECRET || "";

function verify(secret: string, body: string, sig: string): boolean {
  if (!secret) return true;
  return sig === "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

const server = createServer((req, res) => {
  if (req.method !== "POST") { res.writeHead(405).end(); return; }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (!verify(SECRET, body, (req.headers["x-webhook-signature"] as string) || "")) {
      res.writeHead(401).end(); return;
    }
    try {
      const p = JSON.parse(body);
      const icon = p.status === "FINISHED" ? "OK" : "!!";
      const time = new Date().toLocaleTimeString("en-US", { hour12: false });
      console.log(`\n[${time}] ${p.event}`);
      console.log(`  [${icon}] Agent: ${p.id} | Status: ${p.status}`);
      if (p.target?.branchName) console.log(`  Branch: ${p.target.branchName}`);
      if (p.target?.prUrl) console.log(`  PR: ${p.target.prUrl}`);
      if (p.summary) console.log(`  Summary: ${p.summary.slice(0, 120)}`);
    } catch { console.log(`Received: ${body.slice(0, 200)}`); }
    res.writeHead(200).end("OK");
  });
});

server.listen(PORT, () => {
  console.log("Webhook server listening on http://localhost:" + PORT);
  console.log("Expose with: ngrok http " + PORT);
});
