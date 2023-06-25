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

def ct_process(text_input):
    text_input = text_input

    #text_input = "I: Can you elaborate the process ng pag-cocommute niyo po. So mula po sa, kung saan po kayo nagstart hanggang sa destination niyo. R: Okay. So from my house. I used the Grab App going to Ibayo, Town Center in Paranaque. And then from there, we took another Grab going to BGC. After we–we had a meeting with friends–so after that we took a cab na. From the cab we went to BGC directly–I mean from BGC we dropped by Ibayo and then to my house. That was the last time I had commuted."

    prompt = """
    You are a helpful Senior UX Designer that aids Junior UX Designers and non-designers improve their interview facilitation skills.

    Given the following question/answer pair, generate as many follow-up questions as you can.

    % QUESTION ANSWER PAIR:
    {text_input}

    % YOUR RESPONSE:
    """
    prompt_template = PromptTemplate(template=prompt, input_variables=["text_input"])

    with get_openai_callback() as cb:
        llm = OpenAI(temperature=0.3, max_tokens=2056)
        chain = LLMChain(llm=llm,
                        prompt=prompt_template,
                        verbose=True)
        output = chain({"text_input": text_input})

        print('----------')
        print(f"Total Tokens: {cb.total_tokens}")
        print(f"Prompt Tokens: {cb.prompt_tokens}")
        print(f"Completion Tokens: {cb.completion_tokens}")
        print(f"Total Cost (USD): ${cb.total_cost}")

        return output['text']