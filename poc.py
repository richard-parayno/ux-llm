from langchain.llms import OpenAI, OpenAIChat
from langchain.chat_models import ChatOpenAI
from langchain.document_loaders import TextLoader
from langchain.embeddings import OpenAIEmbeddings 
from langchain.vectorstores import Chroma
from langchain.chains import RetrievalQA, LLMChain
from langchain.chains.summarize import load_summarize_chain
from langchain.callbacks import get_openai_callback
from langchain.text_splitter import CharacterTextSplitter
from langchain.prompts import PromptTemplate
from dotenv import load_dotenv

load_dotenv()



def llm_process(goal, questions, hypotheses, transcript_path):
    #init vars
    goal = goal
    questions = questions
    hypotheses = hypotheses
    transcript_path = transcript_path
    #load the document
    # loader = PyPDFLoader("Test_Transcript_1.pdf")
    loader = TextLoader(transcript_path)
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

    # system prompt
    template = """
    You are a helpful Senior UX Designer that aids Junior UX Designers and non-designers improve their interview facilitation skills.
    Your goal is to help these people come up with thoughtful and relevant follow-up questions to improve future interview, follow-up interviews, or as questions for email follow-up.

    A good follow-up question is one that is relevant to the established context and works towards the research questions of the interviewer.

    % THE GOAL OF THE RESEARCH IS:
    {goal}

    % THE RESEARCH QUESTIONS FOR THIS RESEARCH IS:
    {questions}

    % THE HYPOTHESIS OF THIS RESEARCH IS:
    {hypotheses}

    % YOUR RESPONSE:

    """
    #template = PromptTemplate(template=template, input_variables=["research_goal", "research_questions", "research_hypotheses"])

    with get_openai_callback() as cb:
        #llm = ChatOpenAI(model="gpt-3.5-turbo")
        #qa = RetrievalQA.from_chain_type(llm=ChatOpenAI(model="gpt-3.5-turbo"), chain_type="stuff", retriever=retriever, return_source_documents=True)
        qa = RetrievalQA.from_chain_type(llm=ChatOpenAI(model="gpt-3.5-turbo"), chain_type="stuff", retriever=retriever, return_source_documents=True)
        # chain = load_summarize_chain(llm,
        #                              chain_type="map_reduce",
        #                              map_prompt=template,
        #                              verbose=True)
        # result = chain({"input_documents": texts,
        #                 "research_goal": research_goal,
        #                 "research_questions": research_questions,
        #                 "research_hypotheses": research_hypotheses})

        # chain = RetrievalQA.from_chain_type(llm,
        #                                     chain_type="stuff",
        #                                     retriever=retriever,
        #                                     chain_type_kwargs={
        #                                         template=template
        #                                     })
        
        #pdf_qa = ChatVectorDBChain.from_llm(OpenAI(temperature=0.9, model_name="gpt-3.5-turbo"),vectordb, return_source_documents=True)
        # query = "You are a helpful Senior UX Designer whose task is to help Junior UX Designers and non-designers improve their interview facilitation skills, particularly their ability to ask meaningful follow up questions. Given an interview transcript, create a set of potential follow-up questions that the interviewer can ask in their next interview sessions or send via e-mail."
        prompt = "Use the provided interview transcript to devise potential questions for future sessions or email communication."
        #result = pdf_qa({"question": query, "chat_history": ""})
        print("Prompt:")
        result = qa({"query": prompt})
        #print(result["query"])
        print("Answer:")
        #print(result["answer"])
        print(result)
        # print(chain)
        print('----------')
        print(f"Total Tokens: {cb.total_tokens}")
        print(f"Prompt Tokens: {cb.prompt_tokens}")
        print(f"Completion Tokens: {cb.completion_tokens}")
        print(f"Total Cost (USD): ${cb.total_cost}")

        return result

