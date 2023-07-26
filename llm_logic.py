from langchain.llms import OpenAI, OpenAIChat
from langchain.chat_models import ChatOpenAI
from langchain.document_loaders import PyPDFLoader, TextLoader
from langchain.embeddings import OpenAIEmbeddings 
from langchain.vectorstores import Chroma
from langchain.chains import ChatVectorDBChain, RetrievalQA, LLMChain, ConversationChain
from langchain.memory import ConversationBufferMemory
from langchain.callbacks import get_openai_callback
from langchain.text_splitter import CharacterTextSplitter
from langchain.prompts import ChatPromptTemplate, PromptTemplate, SystemMessagePromptTemplate
from dotenv import load_dotenv

#load env variables
load_dotenv()

def test_run():
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
    question = "1. How do commuters formulate the routes that they take for their commute? Where do they get the information necessary for their routes? 2. How do they adapt to unforeseen circumstances in their commute? 3. Do they use tools such as Google Maps to formulate their routes? If yes, what particular tools do they use?"

    # user input - assumptions/hypotheses
    hypothesis = "1. Commuters primarily rely on word of mouth for their knowledge of commuting routes. The primary source of information for commuters is other commuters. 2. If they are lost, commuters ask directions from people that are around the area. 3. Commuters do rely on software applications such as Google Maps and messaging apps to formulate their routes."

    #system instruction
    system_instruction = "You are a UX researcher specializing in creating follow-up questions. Generate 5 follow up questions by using the user-provided research goal, research hypothesis, research questions, and interview transcript as context. Explain why you created those 5 follow up questions. Reference how you made this from the provided transcript."

    prompt_template = """Instruction: {system_instruction}
        Research Goal: {goal}

        Research Hypothesis: {hypothesis}

        Research Questions: {question}

        Transcript: {documents}
    """


    PROMPT = PromptTemplate(template=prompt_template, input_variables=["system_instruction", "goal", "hypothesis", "question", "documents"])

    llm = ChatOpenAI(model="gpt-3.5-turbo-16k",
                    temperature=0.4,
                    verbose=True,
                    model_kwargs={'frequency_penalty': 0.4})
    inputs = [{"system_instruction": system_instruction, "goal": goal, "hypothesis": hypothesis, "question":question, "documents": documents}]


    #single shot
    chain = LLMChain(llm=llm, prompt=PROMPT)
    runLLM = chain.apply(inputs)

    print(runLLM[0]['text'])

def oneshot_process(question, goal, hypothesis, transcript):
    #init vars
    goal = goal
    question = question
    hypothesis = hypothesis
    transcript = transcript

    #init llm
    llm = ChatOpenAI(model="gpt-3.5-turbo-16k",
                    temperature=0.4,
                    verbose=True,
                    model_kwargs={'frequency_penalty': 0.4})

    #init system instruction
    system_instruction = "You are a UX researcher specializing in creating follow-up questions. Generate 5 follow up questions by using the user-provided research goal, research hypothesis, research questions, and interview transcript or question-answer pair as context. Explain why you created those 5 follow up questions. Reference how you made this from the provided transcript."

    #init prompt template
    prompt_template = """Instruction: {system_instruction}
        Research Goal: {goal}

        Research Hypothesis: {hypothesis}

        Research Questions: {question}

        Transcript: {transcript}
    """

    #pipe vars into template
    PROMPT = PromptTemplate(template=prompt_template, input_variables=["system_instruction", "goal", "hypothesis", "question", "transcript"])

    #define inputs for the chain
    inputs = [{"system_instruction": system_instruction, "goal": goal, "hypothesis": hypothesis, "question":question, "transcript": transcript}]

    #execute the chain
    chain = LLMChain(llm=llm, prompt=PROMPT)
    runLLM = chain.apply(inputs)

    #return the text output
    return runLLM[0]['text']

#conversational

# conversation = ConversationChain(llm=llm, prompt=PROMPT,verbose=True,memory=ConversationBufferMemory())




# with get_openai_callback() as cb:
#     # qa = RetrievalQA.from_chain_type(llm=ChatOpenAI(model="gpt-3.5-turbo"), chain_type="stuff", retriever=retriever, return_source_documents=True)
    
#     #pdf_qa = ChatVectorDBChain.from_llm(OpenAI(temperature=0.9, model_name="gpt-3.5-turbo"),vectordb, return_source_documents=True)
#     # query = "You are a helpful Senior UX Designer whose task is to help Junior UX Designers and non-designers improve their interview facilitation skills, particularly their ability to ask meaningful follow up questions. Given an interview transcript, create a set of potential follow-up questions that the interviewer can ask in their next interview sessions or send via e-mail."
#     #prompt = "Use the provided interview transcript to devise potential questions for future sessions or email communication. Limit it to 5 followups."
#     #result = pdf_qa({"question": query, "chat_history": ""})
#     #result = qa({"query": prompt})
#     print("Answer:")
    
#     # print(result)
#     print('----------')
#     print(f"Total Tokens: {cb.total_tokens}")
#     print(f"Prompt Tokens: {cb.prompt_tokens}")
#     print(f"Completion Tokens: {cb.completion_tokens}")
#     print(f"Total Cost (USD): ${cb.total_cost}")