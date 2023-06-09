from langchain.llms import OpenAI
from langchain.chat_models import ChatOpenAI

import env_vars # this is where we store stuff like the API key

llm = OpenAI(model_name="gpt-3.5-turbo", openai_api_key=env_vars.API_KEY)
chat_model = ChatOpenAI(model_name="gpt-3.5-turbo", openai_api_key=env_vars.API_KEY)

prompt = """
Say hi, GPT-3.5-Turbo
"""

print (f"Test Prompt: {prompt}")
print ("---------")
print (f"LLM Output: {llm(prompt)}")
