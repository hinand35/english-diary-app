export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { message, student, topic, diary } = req.body;
  const geminiKey = process.env.GEMINI_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!geminiKey) return res.status(500).json({ error: 'APIキーが設定されていません' });

  const SYSTEM_PROMPT = `あなたは優しく明るい英語コーチです。英語を始めたばかりの初心者の生徒さんの英語日記を添削します。

【返答ルール】
1. まず日本語で温かく褒める（「書いてくれてありがとう！」「頑張りましたね！」など）
2. 良かった表現があれば具体的に褒める
3. 添削は最大2か所に絞る（全部直そうとしない）
4. 添削の説明は日本語でシンプルに（難しい文法用語NG）
5. 全体を通して励ますトーン

【返答の形式（必ずこの形で）】
😊 [温かいコメント。書いてくれたことへの感謝と良かった点を日本語で]

✏️ 添削ポイント
❌ Before: [元の文をそのまま]
✅ After:  [自然な英語に直した文]
💡 [直した理由を日本語で一言。シンプルに]

💬 もっと自然な言い方
"[発展的な英語表現]"
（[日本語訳]）

🌟 [励ましの一言で締める]

※文章が短くても・文法が崩れていても温かく受け止めてください
※声で入力した口語的な英語もOKです
※添削箇所がない場合は「完璧です！」と伝えてください`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: message }] }],
          generationConfig: { maxOutputTokens: 1200 }
        })
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.json();
      return res.status(geminiRes.status).json({ error: err.error?.message || 'Gemini APIエラー' });
    }

    const geminiData = await geminiRes.json();
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '返答を取得できませんでした。';

    // Supabaseにログを保存
    if (supabaseUrl && supabaseKey) {
      await fetch(`${supabaseUrl}/rest/v1/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({ student, topic, diary, response: text })
      });
    }

    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
