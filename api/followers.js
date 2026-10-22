export default async function handler(req, res) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  const listRes = await fetch("https://api.line.me/v2/bot/followers/ids", {
    headers: { "Authorization": `Bearer ${token}` }
  });

  if (!listRes.ok) {
    const errText = await listRes.text();
    return res.status(500).json({
      error: "友だち一覧の取得に失敗しました",
      status: listRes.status,
      detail: errText
    });
  }

  const listData = await listRes.json();
  const ids = listData.userIds || [];

  const profiles = [];
  for (const id of ids) {
    const profRes = await fetch(`https://api.line.me/v2/bot/profile/${id}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (profRes.ok) {
      const prof = await profRes.json();
      profiles.push({ userId: id, name: prof.displayName });
    } else {
      profiles.push({ userId: id, name: "(取得不可)" });
    }
  }

  return res.status(200).json({ count: profiles.length, profiles });
}
