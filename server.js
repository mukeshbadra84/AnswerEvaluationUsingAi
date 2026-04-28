
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
require('dotenv').config();


const API_KEY = process.env.GEMINI_API_KEY;
const PORT    = 3002;

const server = http.createServer((req, res) => {

  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && req.url === '/') {
    const filePath = path.join(__dirname, 'index.html');
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('index.html not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/evaluate') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { question, answer, systemPrompt } = JSON.parse(body);

        const fullPrompt = systemPrompt + '\n\n' +
          'Question: ' + question + '\n\nStudent Answer: ' + answer + '\n\nEvaluate this answer thoroughly.';

        const payload = JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 3000 }
        });

        const geminiPath = '/v1beta/models/gemini-2.5-flash:generateContent?key=' + API_KEY;

        const options = {
          hostname: 'generativelanguage.googleapis.com',
          path:     geminiPath,
          method:   'POST',
          headers: {
            'Content-Type':   'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        };

        const apiReq = https.request(options, (apiRes) => {
          let data = '';
          apiRes.on('data', chunk => data += chunk);
          apiRes.on('end', () => {
            try {
              const parsed = JSON.parse(data);

              if (parsed.error) {
                console.error('Gemini error:', parsed.error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: parsed.error.message }));
                return;
              }

              const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '';

              if (!text) {
                console.error('Empty Gemini response. Full response:', JSON.stringify(parsed, null, 2));
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Empty response from Gemini' }));
                return;
              }

              // Strip markdown code fences if present
              let cleaned = text.replace(/```json|```/g, '').trim();

              // Extract the JSON object in case Gemini added extra prose
              const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
              if (!jsonMatch) {
                console.error('No JSON object found in response:', cleaned);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'No valid JSON found in Gemini response' }));
                return;
              }
              cleaned = jsonMatch[0];

              // Validate it parses correctly before sending to client
              try {
                JSON.parse(cleaned);
              } catch (parseErr) {
                console.error('Gemini returned malformed JSON:', parseErr.message);
                console.error('Raw cleaned text:', cleaned);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Gemini returned malformed JSON: ' + parseErr.message }));
                return;
              }

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ result: cleaned }));

            } catch (e) {
              console.error('Parse error:', e.message);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Failed to parse Gemini response: ' + e.message }));
            }
          });
        });

        apiReq.on('error', (e) => {
          console.error('Request error:', e.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        });

        apiReq.write(payload);
        apiReq.end();

      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad request: ' + e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('\n✅ EvalAI server running with Gemini (FREE)!');
  console.log('🌐 Open http://localhost:' + PORT + ' in your browser\n');
});
