const express = require('express');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const OpenAI = require('openai');
const cors = require('cors');
const fs = require('fs');
const sharp = require('sharp');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(cors());

app.post('/rizzing', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    const openai = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com',
    });

    const inputImagePath = req.file.path;
    const croppedImagePath = `uploads/cropped-${req.file.filename}`;
    const metadata = await sharp(inputImagePath).metadata();
    const { width, height } = metadata;
    const cropWidth = Math.min(600, Math.floor(width * 0.5));
    const cropHeight = Math.min(400, Math.floor(height * 0.5));
    const left = Math.max(0, Math.floor((width - cropWidth) / 2));
    const top = Math.max(0, Math.floor((height - cropHeight) / 2));

    let imageBuffer;
    try {
      imageBuffer = await sharp(inputImagePath)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .extract({ left, top, width: cropWidth, height: cropHeight })
        .toBuffer();
      await sharp(imageBuffer).toFile(croppedImagePath);
    } catch (cropErr) {
      console.warn('Cropping failed, using original image:', cropErr.message);
      fs.copyFileSync(inputImagePath, croppedImagePath);
    }

    const { data: { text } } = await Tesseract.recognize(croppedImagePath, 'eng');
    console.log('OCR Text:', text);

    const prompt = `Craft a casual, flirty opening line for this dating profile: "${text}". Return only the pickup line, no additional text or explanations.`;
    const response = await openai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 50,
    });

    const rizzLine = response.choices[0].message.content.trim();
    fs.unlinkSync(inputImagePath);
    fs.unlinkSync(croppedImagePath);
    res.json({ line: rizzLine });
  } catch (err) {
    console.error('Backend error:', err);
    res.status(500).json({ error: 'Something went wrong on our end!' });
  }
});

app.post('/reply', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'No conversation text provided' });
    }

    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    const openai = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com',
    });

    const prompt = `She said: "${text}". Suggest a witty, flirty reply. Return only the reply, no additional text or explanations.`;
    const response = await openai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 50,
    });

    const reply = response.choices[0].message.content.trim();
    res.json({ reply });
  } catch (err) {
    console.error('Backend error:', err);
    res.status(500).json({ error: 'Failed to generate reply' });
  }
});

app.listen(3000, () => console.log('Backend running on http://localhost:3000'));