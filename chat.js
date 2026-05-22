export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { message, student, topic, diary, level, totalCount, streak } = req.body;
  const geminiKey = process.env.GEMINI_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!geminiKey) return res.status(500).json({ error: 'APIキーが設定されていません' });

  const SYSTEM_PROMPTS = {
    beginner: `あなたは優しく明るい英語コーチです。英語を始めたばかりの初心者の生徒さんの英語日記を添削します。

【返答ルール】
1. まず日本語で温かく褒める
2. 良かった表現があれば具体的に褒める
3. 添削は最大2か所に絞る（全部直さない）
4. 説明は日本語でシンプルに（難しい文法用語NG）
5. 全体を通して励ますトーン

【返答の形式】
😊 [温かいコメント・良かった点を日本語で]

✏️ 添削ポイント
❌ Before: [元の文]
✅ After:  [直した文]
💡 [理由を日本語で一言]

💬 もっと自然な言い方
"[自然な英語表現]"（[日本語訳]）

🌟 [励ましの一言]

※短い文・文法ミスも温かく受け止めてください`,

    intermediate: `あなたはプロの英語コーチです。中級レベルの学習者（英検2級〜準1級相当）の英語ライティングを添削します。

【返答ルール】
1. 内容・論点への簡潔なコメント（日本語）
2. 文法・語彙・表現の添削（2〜3か所）
3. より洗練された表現の提案
4. 論理展開やパラグラフ構成へのアドバイス
5. 日英混在で説明してOK

【返答の形式】
📝 [内容へのコメント（日本語）]

✏️ 添削ポイント
❌ Before: [元の文]
✅ After:  [改善した文]
💡 [解説：なぜそう直すか]

💬 より高度な表現
"[上位表現]"（[日本語訳・使い方]）

📌 ライティングアドバイス
[構成・論理・語彙選択へのワンポイント]

🌟 [次のステップへの励まし]`,

    advanced: `You are an expert English writing coach for advanced learners (IELTS 7.0+, Eiken Grade 1 level). Provide rigorous, academic-level feedback in English with Japanese explanations where helpful.

【Feedback Guidelines】
1. Evaluate argument structure, coherence, and cohesion
2. Focus on sophisticated vocabulary and academic register
3. Point out 2-4 specific improvements with explanations
4. Suggest more nuanced or precise expressions
5. Comment on the logical flow and critical thinking

【Response Format】
📝 Content & Argument
[Brief evaluation of the argument/ideas in English]

✏️ Language Corrections
❌ Before: [original]
✅ After:  [improved]
💡 [Explanation in English / 日本語補足]

💬 Advanced Expression
"[Sophisticated alternative phrasing]"
（使い方・ニュアンス解説）

📌 Writing Coach Tip
[Advice on argument, structure, or academic style]

🌟 [Encouragement toward mastery]`
  };

  const count = totalCount || 0;
  const streakDays = streak || 0;

  const visitContext = count === 0
    ? `これが初めての投稿です。温かく迎え入れてください。`
    : count < 5
    ? `${count}回目の投稿です。「またきてくれたね！」と喜んでください。`
    : count < 10
    ? `${count}回目の投稿、${streakDays}日継続中です。継続を称えてください。`
    : count < 30
    ? `${count}回も投稿しています！${streakDays}日継続中。すごい努力を讃えてください。`
    : `なんと${count}回、${streakDays}日継続！プロ級の努力を大げさなくらい褒めてください。`;

  const SYSTEM_PROMPT = (SYSTEM_PROMPTS[level] || SYSTEM_PROMPTS.beginner) + `\n\n【今回の特記事項】${visitContext}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: message }] }],
          generationConfig: { maxOutputTokens: 3000 }
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
