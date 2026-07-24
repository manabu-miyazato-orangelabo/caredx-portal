// Vercel Serverless Function — proxies Gemini requests so the API key
// stays in the server environment and is never shipped to the browser.
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'サーバーにGEMINI_API_KEYが設定されていません' });
    }

    const { promptText } = req.body || {};
    if (!promptText || typeof promptText !== 'string') {
        return res.status(400).json({ error: 'promptTextが必要です' });
    }

    // Try candidate models in order in case one has been retired/renamed by Google.
    const candidateModels = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    let lastError = 'Gemini API呼び出しエラーが発生しました';

    for (const model of candidateModels) {
        try {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: promptText }] }]
                })
            });

            const data = await response.json();

            if (!response.ok) {
                lastError = data.error?.message || lastError;
                // Model not found/unsupported — try the next candidate.
                if (response.status === 404) continue;
                return res.status(response.status).json({ error: lastError });
            }

            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) {
                lastError = 'Gemini APIから有効な応答が得られませんでした';
                continue;
            }

            return res.status(200).json({ text });
        } catch (err) {
            lastError = err.message || lastError;
        }
    }

    return res.status(502).json({ error: lastError });
}
