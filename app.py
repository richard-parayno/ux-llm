from flask import Flask, render_template, request, redirect, url_for, flash, session
from llm_logic import oneshot_process #import llm processing logic
from flask_session import Session
from datetime import timedelta
from clear_sessions import clear_session_files
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = 'YourSecretKey' # Replace with your own secret key
app.config['UPLOAD_PATH'] = 'uploads'  # directory to save uploaded files
app.config['SESSION_TYPE'] = 'filesystem'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=6) # save user submitted records in the server for 6 hours before auto-delete

# init session folder
SESSION_FILE_DIR = os.path.join(os.getcwd(), 'flask_session')
os.makedirs(SESSION_FILE_DIR, exist_ok=True)
app.config['SESSION_FILE_DIR'] = SESSION_FILE_DIR

# clear everything in sessions whenever the app reboots
# clear_session_files(SESSION_FILE_DIR)

#init session
Session(app)

@app.route('/', methods=['GET', 'POST'])
def index():
    return render_template('index.html')

@app.route('/app/intro', methods=['GET', 'POST'])
def step_intro():
    return render_template('intro.html')


@app.route('/app/step-1', methods=['GET', 'POST'])
def step_1():
    if request.method == 'POST':
        session['research_goal'] = request.form.get('research_goal')
        session['research_question'] = request.form.get('research_question')
        session['research_hypothesis'] = request.form.get('research_hypothesis')
        
        print(session)  # print the entire session to see its contents
        print(session.get('research_goal'))
        print(session.get('research_question'))
        print(session.get('research_hypothesis'))

        return redirect('/app/step-2')
    
    
    research_goal = session.get('research_goal')
    research_hypothesis = session.get('research_hypothesis')
    research_question = session.get('research_question')

    return render_template('step1_research.html', research_goal=research_goal, research_hypothesis=research_hypothesis, research_question=research_question, page_title='Intavue - Step 1')

@app.route('/app/step-2', methods=['GET','POST'])
def step_2():
    if not all(key in session for key in ['research_goal', 'research_question', 'research_hypothesis']):
    
        flash('error - either values are not being passed or you\'re not supposed to be here')
        return redirect(url_for('step_1'))

    if request.method == 'POST':
        session['transcript'] = request.form['transcript']

        research_goal = session.get('research_goal')
        research_hypothesis = session.get('research_hypothesis')
        research_question = session.get('research_question')
        transcript = session.get('transcript')

        output = oneshot_process(research_question, research_goal, research_hypothesis, transcript)
        # output = output.replace('\n', '<br>')
        # flash(output, 'llm_response')
        session['llm_response'] = output
        

        return redirect(url_for('step_3'))

    # This block will handle the GET request which displays the form_step2 and previous data
    research_goal = session.get('research_goal')
    research_hypothesis = session.get('research_hypothesis')
    research_question = session.get('research_question')

    return render_template('step2_transcript.html', research_question=research_question, research_goal=research_goal, research_hypothesis=research_hypothesis, page_title='Intavue - Step 2')

@app.route('/app/step-3', methods=['GET', 'POST'])
def step_3():
    if not all(key in session for key in ['research_goal', 'research_question', 'research_hypothesis', 'transcript', 'llm_response']):
        flash('error - either values are not being passed or you\'re not supposed to be here')
        return redirect(url_for('step_1'))
    
    transcript = session.get('transcript')
    output = session.get('llm_response')
    print(output)

    return render_template('step3_results.html', output=output, transcript=transcript, page_title='Intavue - Step 3')


@app.route('/oneshot', methods=['POST'])
def generate():
    if request.method == 'POST':
        research_question = request.form.get('research_question')
        research_goal = request.form.get('research_goal')
        research_hypothesis = request.form.get('research_hypothesis')
        transcript = request.form.get('transcript')

        output = oneshot_process(research_question, research_goal, research_hypothesis, transcript)

        # # Replace newline characters with <br> tag
        output = output.replace('\n', '<br>')

        flash(output, 'llm_response')
        return redirect(url_for('index'))
    
    return redirect(url_for('index'))


if __name__ == '__main__':
    app.run(debug=True)


@app.route('/new-home')
def index_2():
    return render_template('app_layout.html', title='Intavue')

@app.route('/new-home/step1', methods=['GET', 'POST'])
def step1():
    # if request.method == 'POST':

    return render_template('step1_research.html', title='Intavue')

@app.route('/new-home/step2', methods=['GET', 'POST'])
def step2_transcript():
    if request.method == 'POST':
        # Capture transcript data
        transcript = request.form.get('transcript')
        
        # Process the transcript data (e.g., save to a database or analyze it)
        # ...

        # Redirect to the next step or provide some feedback
        return redirect(url_for('step3_results'))

    # Fetch the previous data to display to the user (pseudo code, replace with actual fetching logic)
    research_goal = "User's research goal"  
    research_questions = "User's research questions"
    research_hypothesis = "User's research hypothesis"

    # Render the template with the previous data
    return render_template('step2_transcript.html', title='Transcript Step', 
                           research_goal=research_goal, 
                           research_questions=research_questions, 
                           research_hypothesis=research_hypothesis)

@app.route('/new-home/step3')
def step3_results():
    # This is just sample data for illustration. In a real scenario, you'd fetch the actual data.
    system_results_content = "This is the generated system results based on your research and transcript."
    transcript_content = """This is the generated system results based on your research and transcript.
"""

    return render_template('step3_results.html', system_results=system_results_content, transcript_content=transcript_content)

@app.route('/new-home/thank-you')
def step4_ty():

    return render_template('step4_survey.html')