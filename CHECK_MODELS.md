# How to Check Available Gemini Models

## Quick Check

### Method 1: Use the API endpoint
```bash
# Start your server
npm run dev

# In another terminal, check available models
curl http://localhost:8082/api/models
```

### Method 2: Use the Gemini API directly
```bash
# Replace YOUR_API_KEY with your actual API key
curl "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_API_KEY"
```

## Understanding the Response

The response will show all available models with their capabilities:

```json
{
  "models": [
    {
      "name": "models/gemini-1.5-flash",
      "displayName": "Gemini 1.5 Flash",
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens"
      ]
    },
    {
      "name": "models/gemini-1.5-pro",
      "displayName": "Gemini 1.5 Pro",
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens"
      ]
    }
  ]
}
```

## Currently Recommended Models (as of March 2026)

### For STT (Speech-to-Text):
1. **gemini-1.5-flash** (Recommended)
   - Fast and efficient
   - Good for audio transcription
   - Free tier friendly

2. **gemini-1.5-flash-8b** (Alternative)
   - Even faster
   - Lower cost
   - Good for simple transcriptions

3. **gemini-1.5-pro** (High Quality)
   - Best quality
   - More expensive
   - Use for critical transcriptions

### For Minutes Generation:
1. **gemini-1.5-flash** (Recommended)
   - Fast response
   - Good quality output
   - Free tier friendly

2. **gemini-1.5-pro** (High Quality)
   - Best quality
   - Better understanding
   - More expensive

## How to Set Models

### Option 1: Use Environment Variables
```bash
# In your .env file
GEMINI_MODEL_STT=gemini-1.5-flash
GEMINI_MODEL_MINUTES=gemini-1.5-flash
```

### Option 2: Let the System Auto-Select
```bash
# Leave empty in .env (recommended)
GEMINI_MODEL_STT=
GEMINI_MODEL_MINUTES=
```

The system will automatically try models in this order:
1. gemini-1.5-flash
2. gemini-1.5-flash-8b
3. gemini-1.5-pro
4. gemini-1.5-flash-latest
5. gemini-1.5-pro-latest
6. gemini-pro
7. Any other available model that supports generateContent

## Automatic Fallback

The system has built-in fallback logic:
- If a model fails due to quota/rate limits, it automatically tries the next model
- If a model is not found, it tries the next model
- This ensures high availability even during peak usage

## Troubleshooting

### Error: "Model not found"
**Solution**: The model name might be outdated. Check available models using the methods above.

### Error: "Quota exceeded"
**Solution**: The system will automatically try alternative models. If all fail, wait a few minutes or upgrade your API quota.

### Error: "Model does not support generateContent"
**Solution**: The system filters out incompatible models automatically. This shouldn't happen.

## Best Practices

1. **Don't hardcode model names** - Let the system auto-select
2. **Monitor your quota** - Check Google AI Studio dashboard
3. **Use flash models for development** - They're faster and cheaper
4. **Use pro models for production** - Better quality when needed
5. **Keep models updated** - Check for new models periodically

## Checking Your Current Setup

```bash
# Check what models your system is using
curl http://localhost:8082/api/models | jq '.[] | select(.supportedGenerationMethods | contains(["generateContent"])) | .name'
```

This will show only models that support content generation.

## Model Comparison

| Model | Speed | Quality | Cost | Best For |
|-------|-------|---------|------|----------|
| gemini-1.5-flash | ⚡⚡⚡ | ⭐⭐⭐ | 💰 | General use |
| gemini-1.5-flash-8b | ⚡⚡⚡⚡ | ⭐⭐ | 💰 | Simple tasks |
| gemini-1.5-pro | ⚡⚡ | ⭐⭐⭐⭐⭐ | 💰💰💰 | Critical tasks |

## Need Help?

1. Check the [Gemini API Documentation](https://ai.google.dev/docs)
2. Visit [Google AI Studio](https://aistudio.google.com/)
3. Check your API quota and usage
4. Review the error logs in your server console

---

**Last Updated**: March 23, 2026  
**Recommended Default**: gemini-1.5-flash (or leave empty for auto-select)
