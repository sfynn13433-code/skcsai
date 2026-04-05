import os
import google.generativeai as genai
from dotenv import load_dotenv

# This connects your .env file keys to your code
load_dotenv()
api_key = os.getenv("GOOGLE_API_KEY")

genai.configure(api_key=api_key)

# Pick the fast model for a quick test
model = genai.GenerativeModel('gemini-1.5-flash')

try:
    response = model.generate_content("Testing connection: Give me a short 3-word slogan for SKCS Sports Edge.")
    print("\n--- GOOGLE IS ONLINE ---")
    print(response.text)
except Exception as e:
    print("\n--- CONNECTION FAILED ---")
    print(f"Error: {e}")