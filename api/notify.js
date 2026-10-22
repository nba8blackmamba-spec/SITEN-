export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { to, message } = req.body;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  try {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        to,
        messages: [{ type: "text", text: message }],
      }),
    });
    const data = await response.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
