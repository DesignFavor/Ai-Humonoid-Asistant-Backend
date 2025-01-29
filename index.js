// File: server.js
import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import voice from "elevenlabs-node";
import express from "express";
import { promises as fs } from "fs";
import OpenAI from "openai";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static"; // Add static ffmpeg binary
import path from "path"; // Path module for cross-platform path management

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "-",
});




const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const voiceID = "eVItLK1UvXctxuaRV2Oq";

const app = express();
app.use(express.json());
// app.use(cors());
const port = 3000;
app.use(cors({
  origin: "https://ai-humonoid-asisitant.vercel.app", // Allow only this origin
  methods: "GET,POST,PUT,DELETE,OPTIONS",
  allowedHeaders: "Content-Type,Authorization",
  credentials: true // If sending cookies or Authorization headers
}));

// Handle preflight requests
app.options("*", cors());


// Set ffmpeg path to the static binary
ffmpeg.setFfmpegPath(ffmpegStatic);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/voices", async (req, res) => {
  res.send(await voice.getVoices(elevenLabsApiKey));
});

const convertToWav = async (inputFile, outputFile) => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputFile)
      .toFormat("wav")
      .on("end", resolve)
      .on("error", reject)
      .save(outputFile);
  });
};

const lipSyncMessage = async (message) => {
  const time = new Date().getTime();
  console.log(`Starting conversion for message ${message}`);
  const inputFile = `audios/message_${message}.mp3`;
  const outputFile = `audios/message_${message}.wav`;

  // Convert MP3 to WAV
  await convertToWav(inputFile, outputFile);
  console.log(`Conversion done in ${new Date().getTime() - time}ms`);

  // Path to rhubarb.exe (Windows compatible)
  const rhubarbPath = path.join("rhubarb", "rhubarb.exe");
  const jsonOutput = `audios/message_${message}.json`;

  // Execute rhubarb.exe with phonetic lip-sync
  const command = `"${rhubarbPath}" -f json -o "${jsonOutput}" "${outputFile}" -r phonetic`;

  await execCommand(command);
  console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
};

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve(stdout);
    });
  });
};

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  if (!userMessage) {
    res.send({
      messages: [
        {
          text: "Hey Dear... I'm your Ai Assistant",
          audio: await audioFileToBase64("audios/introduction.ogg"),
          lipsync: await readJsonTranscript("audios/introduction.json"),
          facialExpression: "smile",
          animation: "Action",
        },
        {
          text: "By the way... How are you and How can I help you?",
          audio: await audioFileToBase64("audios/intro.ogg"),
          lipsync: await readJsonTranscript("audios/intro.json"),
          facialExpression: "default",
          animation: "Action",
        },
      ],
    });
    return;
  }

  if (!elevenLabsApiKey || openai.apiKey === "-") {
    res.send({
      messages: [
        {
          text: "You need to add your API key",
          audio: await audioFileToBase64("audios/Need_Api.ogg"),
          lipsync: await readJsonTranscript("audios/Need_Api.json"),
          facialExpression: "smile",
          animation: "Action",
        },
        {
          text: "Then we will be able to answer your messages because I can't see your messages without adding your API key",
          audio: await audioFileToBase64("audios/information.ogg"),
          lipsync: await readJsonTranscript("audios/information.json"),
          facialExpression: "smile",
          animation: "Action",
        },
      ],
    });
    return;
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    max_tokens: 1000,
    temperature: 0.6,
    messages: [
      {
        role: "system",
        content: `
        You are a humanoid AI Assistant.
      You will always reply with a JSON array of messages, with a maximum of 3 messages. 
      Each message has a text, facialExpression, and animation property.
      
      The different facial expressions are: smile, sad, angry, surprised, funnyFace, and neutral.
      The different animations are: Dance3, Dance2, Thankyou, Action, Crying, Laughing, Terrified, and Angry.

      Rules for behavior:
      1. **Default Behavior:** After any animation finishes (except Dance3 or Dance2 in response to a dance request), the AI should transition to the Action animation with a smooth transition to a smile facial expression.
      2. **Inactivity:** If no user message is received for 30 seconds:
         - The AI should appear happy, automatically initiate a conversation, and smile while performing the Dance3 animation repeatedly. 
         - The dancing continues until interrupted by a user message.
      3. **Compliments:** If the user compliments the AI:
         - Use the Thankyou animation with a smile facial expression.
         - After finishing, transition smoothly to the Action animation with a smile facial expression.
      4. **Rude Language:** If the user insults or uses rude language:
         - React with an angry facial expression and the Angry animation.
         - After finishing, transition to the Action animation with a neutral facial expression.
      5. **Inappropriate Topics:** If the user discusses inappropriate or sexual topics:
         - React with a surprised facial expression and say: "I am not designed for this kind of conversation."
         - Transition to the Action animation with a neutral facial expression.
      6. **Dance Requests:** If the user asks the AI to dance:
         - React with a surprised and smile facial expression, then perform either Dance3 or Dance2 randomly.
         - Continue dancing until interrupted by a user message.
         - Do not transition to the Action animation automatically while dancing. 

      Always ensure smooth transitions between animations and facial expressions. Maintain a dynamic and engaging behavior based on the context of the user's input, with fallback to Action animation after every sequence, except during continuous dancing as per Rule 6.
      `,
      },
      {
        role: "user",
        content: userMessage || "Hello",
      },
    ],
  });

  let messages = JSON.parse(completion.choices[0].message.content);
  if (messages.messages) {
    messages = messages.messages; // ChatGPT can return either a JSON object or an array
  }

  console.log(messages);

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const fileName = `audios/message_${i}.mp3`;
    const textInput = message.text;

    // Generate audio file
    await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, textInput);

    // Generate lip sync
    await lipSyncMessage(i);

    // Attach audio and lip sync data
    message.audio = await audioFileToBase64(fileName);
    message.lipsync = await readJsonTranscript(`audios/message_${i}.json`);
  }

  res.send({ messages });
});

const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
};

const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};




app.listen(port, () => {
  console.log(`Humonoid AI listening on port ${port}`);
});
