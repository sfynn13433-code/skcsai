from groq import Groq

client = Groq()

user_input = """
Do NOT ask questions. Generate code immediately.

You are editing an existing subscription page.

Modify the existing subscription UI to include a toggle system.

1. Add two buttons at the top:
- SKCS Core
- SKCS Elite

2. Functionality:
- Only one button active at a time
- Clicking Core shows ONLY Core plans
- Clicking Elite shows ONLY Elite plans

3. Keep EXISTING layout:
- Do NOT redesign the page
- Do NOT use Tailwind or new frameworks

4. Styling:
- Core = green (#00c853)
- Elite = blue (#2962ff)

5. Remove any watermark on the right side

6. Update subscription cards to include:
- 4-Day Sprint (£3.99)
- Daily AI predictions
- AI-weighted selections
- ACCA filtering
- 6-hour final updates

Return ONLY the modified HTML and CSS.
"""

completion = client.chat.completions.create(
    model="openai/gpt-oss-120b",
    messages=[
        {"role": "user", "content": user_input}
    ],
    stream=True
)

for chunk in completion:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")