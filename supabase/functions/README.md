# Edge Function deployment

Deploy Haven's server-side AI proxy after adding the API keys to Supabase secrets:

```bash
supabase secrets set GROQ_API_KEY=your_groq_key_here
supabase secrets set GEMINI_API_KEY=your_gemini_key_here
supabase functions deploy haven-chat --no-verify-jwt
```

`haven-chat` deliberately reads these keys only from Supabase Edge Function secrets. Do not add Groq or Gemini keys to Vite environment variables.
