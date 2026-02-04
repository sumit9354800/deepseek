import connectDB from "@/config/db";
import Chat from "@/models/Chat";
import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://api.deepseek.com/v1",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

export const maxDuration = 60;

export async function POST(req) {
  try {
    const { userId } = getAuth(req);
    // extract ChatId and prompt from the request body
    const { chatId, prompt } = await req.json();

    if (!userId) {
      return NextResponse.json({
        success: false,
        message: "User not authenticated",
      });
    }
    
    // Connect to database
    await connectDB();
    
    // find the chat document in the database based on userId and chatId
    const data = await Chat.findOne({ userId, _id: chatId });
    
    if (!data) {
      return NextResponse.json({
        success: false,
        message: "Chat not found",
      });
    }

    // create a user message Object
    const userPrompt = {
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    };
    data.messages.push(userPrompt);
    // persist the user's message immediately so it's not lost if completion fails
    await data.save();

    //  call the deepseek API to get a completion
    let completion;
    try {
      if (!process.env.DEEPSEEK_API_KEY) {
        throw new Error("DEEPSEEK_API_KEY is not configured");
      }

      completion = await openai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "deepseek-chat",
        store: true,
      });

      if (!completion || !completion.choices || completion.choices.length === 0) {
        throw new Error("No completion returned");
      }

      const message = completion.choices[0].message;
      message.timestamp = Date.now();
      data.messages.push(message);
      await data.save();

      return NextResponse.json({ success: true, data: message });
    } catch (err) {
      console.error("OpenAI/completion error:", err);
      console.error("Error status:", err.status);
      console.error("Error message:", err.message);
      console.error("Error response:", err.response?.data);
      
      // determine if this was a billing/insufficient balance error
      const isBillingError = err && (err.status === 402 || (err.message && /402|insufficient balance|billing|overdraft/i.test(err.message)));
      
      // If billing error, rollback the persisted user message
      if (isBillingError) {
        try {
          // remove the last user message we persisted
          for (let i = data.messages.length - 1; i >= 0; i--) {
            const m = data.messages[i];
            if (m && m.role === "user" && String(m.content) === String(prompt)) {
              data.messages.splice(i, 1);
              break;
            }
          }
          await data.save();
        } catch (removeErr) {
          console.error("Failed to remove user message after billing error:", removeErr);
        }
        // Include detailed error info in development to help debugging
        const devInfo = process.env.NODE_ENV === "development" ? { error: err.message, response: err.response?.data } : undefined;
        return NextResponse.json({ success: false, message: "Service temporarily unavailable. Please try again later.", billing: true, ...devInfo });
      }

      // For non-billing errors, save a fallback assistant message
      const fallback = {
        role: "assistant",
        content: "AI temporarily unavailable. Please try again later.",
        timestamp: Date.now(),
      };
      try {
        data.messages.push(fallback);
        await data.save();
        return NextResponse.json({ success: true, data: fallback, fallback: true });
      } catch (saveErr) {
        console.error("Failed saving fallback message:", saveErr);
        return NextResponse.json({ success: false, message: saveErr.message || "Failed to save fallback message" });
      }
    }
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message });
  }
}
