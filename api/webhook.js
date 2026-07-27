export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const events = req.body.events || [];
  
  for (const event of events) {
    if (event.source.type === "group") {
      const groupId = event.source.groupId;
      console.log("GROUP ID:", groupId);
      
      // Firestoreに保存
      const { initializeApp, getApps } = await import("firebase/app");
      const { getFirestore, doc, setDoc } = await import("firebase/firestore");
      
      if (!getApps().length) {
        initializeApp({
          apiKey: process.env.FIREBASE_API_KEY,
          authDomain: "siten-fee7d.firebaseapp.com",
          projectId: "siten-fee7d",
        });
      }
      const db = getFirestore();
      await setDoc(doc(db, "settings", "lineGroup"), { groupId });
    }
  }
  
  return res.status(200).json({ ok: true });
}
