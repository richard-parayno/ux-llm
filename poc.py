from langchain.llms import OpenAI
from langchain.chat_models import ChatOpenAI
from langchain.document_loaders import PyPDFLoader
from langchain.embeddings import OpenAIEmbeddings 
from langchain.vectorstores import Chroma
from langchain.chains import ChatVectorDBChain
from langchain.callbacks import get_openai_callback

import env_vars # this is where we store stuff like the API key

#load the PDF
loader = PyPDFLoader("Test_Transcript_1.pdf")
pages = loader.load_and_split()

# create embeddings
embeddings = OpenAIEmbeddings(openai_api_key=env_vars.OPENAI_API_KEY)
vectordb = Chroma.from_documents(pages, embedding=embeddings,
                                 persist_directory=".")
vectordb.persist()

# llm = OpenAI(model_name="gpt-3.5-turbo", openai_api_key=env_vars.OPENAI_API_KEY)
# chat_model = ChatOpenAI(model_name="gpt-3.5-turbo", openai_api_key=env_vars.OPENAI_API_KEY)

prompt = """
Say hi, GPT-3.5-Turbo
"""

#print (f"Test Prompt: {prompt}")
#print ("---------")
#print (f"LLM Output: {llm(prompt)}")
# print(pages[0].page_content)


with get_openai_callback() as cb:
    pdf_qa = ChatVectorDBChain.from_llm(OpenAI(temperature=0.9, model_name="gpt-3.5-turbo", openai_api_key=env_vars.OPENAI_API_KEY),
                                    vectordb, return_source_documents=True)
    # query = "You are a helpful Senior UX Designer whose task is to help Junior UX Designers and non-designers improve their interview facilitation skills, particularly their ability to ask meaningful follow up questions. Given an interview transcript, create a set of potential follow-up questions that the interviewer can ask in their next interview sessions or send via e-mail."
    query = "Assist junior designers and non-designers in enhancing their interview skills, especially in asking insightful follow-ups. Use an interview transcript to devise potential questions for future sessions or email communication."
    result = pdf_qa({"question": query, "chat_history": ""})
    print("Answer:")
    print(result["answer"])
    print('----------')
    print(f"Total Tokens: {cb.total_tokens}")
    print(f"Prompt Tokens: {cb.prompt_tokens}")
    print(f"Completion Tokens: {cb.completion_tokens}")
    print(f"Total Cost (USD): ${cb.total_cost}")