from langchain.llms import OpenAI, OpenAIChat
from langchain.chat_models import ChatOpenAI
from langchain.document_loaders import PyPDFLoader, TextLoader
from langchain.embeddings import OpenAIEmbeddings 
from langchain.vectorstores import Chroma
from langchain.chains import ChatVectorDBChain, RetrievalQA
from langchain.callbacks import get_openai_callback
from langchain.text_splitter import CharacterTextSplitter
from dotenv import load_dotenv

load_dotenv()

#load the PDF
# loader = PyPDFLoader("Test_Transcript_1.pdf")
loader = TextLoader("./test_transcript_1.txt")
documents = loader.load()

text_splitter = CharacterTextSplitter(chunk_size=1000, chunk_overlap=0)
texts = text_splitter.split_documents(documents)

# create embeddings
embeddings = OpenAIEmbeddings()
vectordb = Chroma.from_documents(texts, embedding=embeddings)

retriever = vectordb.as_retriever()


# llm = OpenAI(model_name="gpt-3.5-turbo", openai_api_key=env_vars.OPENAI_API_KEY)
# chat_model = ChatOpenAI(model_name="gpt-3.5-turbo", openai_api_key=env_vars.OPENAI_API_KEY)

# prompt = """
# Say hi, GPT-3.5-Turbo
# """

#print (f"Test Prompt: {prompt}")
#print ("---------")
#print (f"LLM Output: {llm(prompt)}")
# print(pages[0].page_content)


with get_openai_callback() as cb:
    qa = RetrievalQA.from_chain_type(llm=ChatOpenAI(model="gpt-3.5-turbo"), chain_type="stuff", retriever=retriever, return_source_documents=True)
    #pdf_qa = ChatVectorDBChain.from_llm(OpenAI(temperature=0.9, model_name="gpt-3.5-turbo"),vectordb, return_source_documents=True)
    # query = "You are a helpful Senior UX Designer whose task is to help Junior UX Designers and non-designers improve their interview facilitation skills, particularly their ability to ask meaningful follow up questions. Given an interview transcript, create a set of potential follow-up questions that the interviewer can ask in their next interview sessions or send via e-mail."
    prompt = "Assist junior designers and non-designers in enhancing their interview skills, especially in asking insightful follow-ups. Use the provided interview transcript to devise potential questions for future sessions or email communication."
    #result = pdf_qa({"question": query, "chat_history": ""})
    result = qa({"query": prompt})
    print("Answer:")
    #print(result["answer"])
    print(result['result'])
    print('----------')
    print(f"Total Tokens: {cb.total_tokens}")
    print(f"Prompt Tokens: {cb.prompt_tokens}")
    print(f"Completion Tokens: {cb.completion_tokens}")
    print(f"Total Cost (USD): ${cb.total_cost}")