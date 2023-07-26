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
