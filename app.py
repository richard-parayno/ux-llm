from flask import Flask, render_template, request, redirect, url_for, flash
from forms import LLMParamsForm, LLMConfidenceForm
from poc import llm_process #import llm processing logic
from confidence_test import ct_process
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = 'YourSecretKey' # Replace with your own secret key
app.config['UPLOAD_PATH'] = 'uploads'  # directory to save uploaded files

@app.route('/', methods=['GET', 'POST'])
def index():
    form = LLMParamsForm()
    result = None #init result var
    if form.validate_on_submit():
        # Check if upload path exists, create it if it does not
        if not os.path.exists(app.config['UPLOAD_PATH']):
            os.makedirs(app.config['UPLOAD_PATH'])
            
        file = form.interview_transcripts.data
        filename = file.filename
        file.save(os.path.join(app.config['UPLOAD_PATH'], filename))
        
        # Pass params
        transcript_path = os.path.join(app.config['UPLOAD_PATH'], filename)
        result = llm_process(form.goal.data, form.questions.data, form.hypotheses.data, transcript_path)

        flash('Processing Complete!', 'success')
        
        #return redirect(url_for('index'))  # or redirect to a success page
    return render_template('index.html', form=form, result=result)

@app.route('/confidence-test', methods=['GET', 'POST'])
def confidence_test():
    form = LLMConfidenceForm()
    result = None #init result
    if form.validate_on_submit():
        result = ct_process(form.question_answer.data)

    return render_template('confidence_test.html', form=form, result=result)


if __name__ == '__main__':
    app.run(debug=True)
