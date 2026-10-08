from langchain.llms import OpenAI, OpenAIChat
from langchain.chat_models import ChatOpenAI
from langchain.document_loaders import TextLoader
from langchain.embeddings import OpenAIEmbeddings 
from langchain.vectorstores import Chroma
from langchain.chains import RetrievalQA, LLMChain
from langchain.chains.summarize import load_summarize_chain
from langchain.callbacks import get_openai_callback
from langchain.text_splitter import CharacterTextSplitter, RecursiveCharacterTextSplitter
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
    loader = TextLoader(transcript_path)
    documents = loader.load()

    #split the document into manageable chunks for the vector db
    text_splitter = CharacterTextSplitter(chunk_size=1000, chunk_overlap=0)
    texts = text_splitter.split_documents(documents)

    # create embeddings
    embeddings = OpenAIEmbeddings()
    vectordb = Chroma.from_documents(texts, embedding=embeddings)
    

    # user input - research goal
    goal = "This research intends to investigate how commuters within Metro Manila formulate their routes for their daily commute to gain a better insight on the commuting experience within the area. The aim of the study is to understan the commuter experience to identify critical areas that need to be improved upon."

    # user input - research questions
    questions = "1. How do commuters formulate the routes that they take for their commute? Where do they get the information necessary for their routes? 2. How do they adapt to unforeseen circumstances in their commute? 3. Do they use tools such as Google Maps to formulate their routes? If yes, what particular tools do they use?"

    # user input - assumptions/hypotheses
    hypotheses = "1. Commuters primarily rely on word of mouth for their knowledge of commuting routes. The primary source of information for commuters is other commuters. 2. If they are lost, commuters ask directions from people that are around the area. 3. Commuters do rely on software applications such as Google Maps and messaging apps to formulate their routes."

    #map prompt
    map_prompt = """
    You are a helpful Senior UX Designer that aids Junior UX Designers and non-designers improve their interview facilitation skills.
    
    Your goal is to help these people come up with thoughtful and relevant follow-up questions to improve future interview, follow-up interviews, or as questions for email follow-up.

    A good follow-up question is one that is relevant to the established context and works towards the research questions of the interviewer.

    % RESEARCH GOAL:
    {goals}
    % END OF RESEARCH GOAL:

    % RESEARCH HYPOTHESIS:
    {hypotheses}
    % END OF RESEARCH HYPOTHESES:

    % RESEARCH QUESTIONS:
    {questions}
    % END OF RESEARCH QUESTIONS:

    % START OF INTERVIEW TRANSCRIPT:
    {text}
    % END OF INTERVIEW TRANSCRIPT:

    Please respond with a list of 5 follow-up questions based on the contents of the transcript above, as well as the GOAL, HYPOTHESIS, and RESEARCH QUESTIONS.
    """

    map_prompt_template = PromptTemplate(template=map_prompt, input_variables=["text", "goals", "hypotheses", "questions"])
    combine_prompt = """
    You are a helpful Senior UX Designer that aids Junior UX Designers and non-designers improve their interview facilitation skills.
    
    Your goal is to help these people come up with thoughtful and relevant follow-up questions to improve future interview, follow-up interviews, or as questions for email follow-up.

    Please consolidate the questions and return a list

    % INTERVIEW QUESTIONS
    {text}

    % YOUR RESPONSE:
    """
    combine_prompt_template = PromptTemplate(template=combine_prompt, input_variables=["text"])


    with get_openai_callback() as cb:
        

        llm = ChatOpenAI(temperature=0, model="gpt-3.5-turbo-16k")
        chain = load_summarize_chain(llm=llm,
                         chain_type="map_reduce",
                         map_prompt=map_prompt_template,
                         combine_prompt=combine_prompt_template,
                         verbose=True)

        #inputs = [{"goal": goal, "questions": questions, "hypotheses": hypotheses} for doc in docs]
        output = chain({"input_documents": texts,
                        "goals": goal,
                        "questions": questions,
                        "hypotheses": hypotheses})
        # output = chain({"input_documents": texts})
        print('----------')
        print(f"Total Tokens: {cb.total_tokens}")
        print(f"Prompt Tokens: {cb.prompt_tokens}")
        print(f"Completion Tokens: {cb.completion_tokens}")
        print(f"Total Cost (USD): ${cb.total_cost}")

        #return chain.apply(inputs)
        return output['output_text']

