from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from forms import LLMParamsForm, LLMConfidenceForm
from poc import llm_process #import llm processing logic
from llm_logic import oneshot_process 
from confidence_test import ct_process
import os
import json

app = Flask(__name__)
app.config['SECRET_KEY'] = 'YourSecretKey' # Replace with your own secret key
app.config['UPLOAD_PATH'] = 'uploads'  # directory to save uploaded files


@app.route('/')
def index():
    research_question = request.args.get('research_question', default='')
    research_hypothesis = request.args.get('research_hypothesis', default='')
    research_goal = request.args.get('research_goal', default='')
    transcript = request.args.get('transcript', default='')

    return render_template('index.html', research_question=research_question, research_hypothesis=research_hypothesis, research_goal=research_goal, transcript=transcript)

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

        flash(output)
        return redirect(url_for('index'))
    
    return redirect(url_for('index'))

@app.route('/confidence-test', methods=['GET', 'POST'])
def confidence_test():
    form = LLMConfidenceForm()
    result = None #init result
    if form.validate_on_submit():
        result = ct_process(form.question_answer.data)

    return render_template('confidence_test.html', form=form, result=result)


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