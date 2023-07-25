from langchain.llms import OpenAI, OpenAIChat
from langchain.chat_models import ChatOpenAI
from langchain.document_loaders import PyPDFLoader, TextLoader
from langchain.embeddings import OpenAIEmbeddings 
from langchain.vectorstores import Chroma
from langchain.chains import ChatVectorDBChain, RetrievalQA
from langchain.callbacks import get_openai_callback
from langchain.text_splitter import CharacterTextSplitter
from langchain.prompts import ChatPromptTemplate
from dotenv import load_dotenv

#load env variables
load_dotenv()

#load the document
# loader = PyPDFLoader("Test_Transcript_1.pdf")
loader = TextLoader("./test_transcript_1.txt")
documents = loader.load()

#split the document into manageable chunks for the vector db
text_splitter = CharacterTextSplitter(chunk_size=1000, chunk_overlap=0)
texts = text_splitter.split_documents(documents)

# create embeddings
embeddings = OpenAIEmbeddings()
vectordb = Chroma.from_documents(texts, embedding=embeddings)

retriever = vectordb.as_retriever()

# user input - research goal
goal = "This research intends to investigate how commuters within Metro Manila formulate their routes for their daily commute to gain a better insight on the commuting experience within the area. The aim of the study is to understan the commuter experience to identify critical areas that need to be improved upon."

# user input - research questions
questions = "1. How do commuters formulate the routes that they take for their commute? Where do they get the information necessary for their routes? 2. How do they adapt to unforeseen circumstances in their commute? 3. Do they use tools such as Google Maps to formulate their routes? If yes, what particular tools do they use?"

# user input - assumptions/hypotheses
hypotheses = "1. Commuters primarily rely on word of mouth for their knowledge of commuting routes. The primary source of information for commuters is other commuters. 2. If they are lost, commuters ask directions from people that are around the area. 3. Commuters do rely on software applications such as Google Maps and messaging apps to formulate their routes."

multiple_input_prompt = ChatPromptTemplate(
    input_variables=["research_goal", "research_hypothesis", "research_questions", "transcript_section"],
    template="""You are a UX researcher specializing in creating follow-up questions. Use the provided research goal, research hypothesis, research questions, and transcript as context and generate 5 follow up questions.
    
    Research Goal: {research_goal}
    
    Research Hypothesis: {research_hypothesis}
    
    Research Questions: {research_questions}
    
    Transcript: {transcript_section}"""
)
passToOAI = multiple_input_prompt.format(research_goal=goal, research_hypothesis=hypotheses, research_questions=questions, transcript_section=retriever)


with get_openai_callback() as cb:
    # qa = RetrievalQA.from_chain_type(llm=ChatOpenAI(model="gpt-3.5-turbo"), chain_type="stuff", retriever=retriever, return_source_documents=True)
    qa = ChatOpenAI(model="gpt-3.5-turbo-16k")
    #pdf_qa = ChatVectorDBChain.from_llm(OpenAI(temperature=0.9, model_name="gpt-3.5-turbo"),vectordb, return_source_documents=True)
    # query = "You are a helpful Senior UX Designer whose task is to help Junior UX Designers and non-designers improve their interview facilitation skills, particularly their ability to ask meaningful follow up questions. Given an interview transcript, create a set of potential follow-up questions that the interviewer can ask in their next interview sessions or send via e-mail."
    #prompt = "Use the provided interview transcript to devise potential questions for future sessions or email communication. Limit it to 5 followups."
    #result = pdf_qa({"question": query, "chat_history": ""})
    #result = qa({"query": prompt})
    print("Answer:")
    print(qa(passToOAI))
    # print(result)
    print('----------')
    print(f"Total Tokens: {cb.total_tokens}")
    print(f"Prompt Tokens: {cb.prompt_tokens}")
    print(f"Completion Tokens: {cb.completion_tokens}")
    print(f"Total Cost (USD): ${cb.total_cost}")