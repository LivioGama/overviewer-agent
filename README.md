# Overviewer

🤖 **An autonomous GitHub contributor bot that investigates issues, implements fixes, and opens PRs — automatically.**

Overviewer is a GitHub App that acts like an AI-powered maintainer. When an issue is opened, Overviewer will try to fix it by writing code, testing it, and opening a pull request — all without human intervention.

![GitHub App](https://img.shields.io/badge/GitHub-App-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![LLM](https://img.shields.io/badge/AI-LLM-green)

## ✨ How It Works

1. **Issue Triage**  
   When a new issue is opened, Overviewer acknowledges it and announces it will investigate.  

2. **Automated Fix Implementation**  
   Overviewer uses an LLM (configurable) to analyze the problem, apply code changes, and implement a solution.  

3. **Self-Review & Testing**  
   - Runs tests and linting  
   - Handles streaming responses and errors  
   - Ensures backward compatibility  

4. **Pull Request Creation**  
   Overviewer automatically opens a PR with:  
   - Problem summary  
   - Solution details  
   - Changes made  
   - Testing confirmation  

5. **Final Follow-Up**  
   Posts a comment linking the PR, summarizing the fix, and confirming CI checks passed.  

---

## 🐛 Example Workflow

- You open **Issue #7070**: Ollama models were using OpenAI routes instead of native `/api/chat`.  
- Overviewer replies: *“I’ll look into this and try to fix it.”*  
- It opens **PR #7071** that:  
  - Replaces OpenAI client calls with direct `axios` requests to Ollama’s `/api/chat`  
  - Updates message format conversion & streaming handling  
  - Updates and passes all tests  
- Overviewer comments back: *“I’ve successfully implemented a fix! ✅”*  

---

## 🚀 Key Features

- 💰 **Ultra Cheap AI** - Uses Grok Code Fast 1 via OpenRouter (~$0.0002/1M tokens)
- 🔎 Automatic issue triage  
- 🛠️ AI-powered code fixes  
- ✅ Self-review and testing  
- 📦 Automatic PR creation  
- 🔗 Full issue-to-PR workflow  

---

👉 In short: **Overviewer is your AI co-maintainer — it handles issues from report to PR.**
