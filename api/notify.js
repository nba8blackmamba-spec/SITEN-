// スタッフ画面からの LINE 送信（スタッフとしてログインしている場合のみ）
import { requireStaff, pushLine } from "./_lib/server.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!(await requireStaff(req, res))) return;

  const { to, message } = req.body || {};
  if (!to || !message) return res.status(400).json({ error: "toとmessageが必要です" });
  try {
    const { data } = await pushLine(to, String(message));
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
