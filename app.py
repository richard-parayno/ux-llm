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
    transcript_content = """[SPEAKER]: Right, so I'll just go ahead with the question. So for my first question, what prompted you to start your newsletter? And how would you assess your newsletter's performance currently?

[SPEAKER]: Yes, so yeah, I've been writing newsletters for a while for different purposes, just to explore my curiosity and to share what I've learned with my audience. Right now, the latest one that I run is called "Super Frameworks." It's more focused around business ideas, strategies, marketing, and actionable frameworks for solopreneurs like my audience on Twitter and my newsletter audience. So that's the purpose. The monetization aspect of it is that I promote my own info products and communities via the newsletter. I have a big community and I have a bunch of courses and ebooks that I create. So I promote that. And I also monetize through ads, sponsorships, and affiliate products. That's the business model of the newsletter, but I haven't gone all in on it because it's not a priority for me. The business aspect is a priority for me right now.

[SPEAKER]: Um, what platform are you currently using to send out your newsletter?

[SPEAKER]: I use ConvertKit. I send it out through ConvertKit and I host the archive of the newsletter on my website.

[SPEAKER]: Are you currently facing any hurdles or challenges in creating your newsletter? And I guess growing your newsletter and getting subscribers? What are the hurdles?

[SPEAKER]: Yeah, getting subscribers is always hard, especially because Twitter is my primary audience and primary channel where my audience is. And promoting newsletters on Twitter is hard because external links are not appreciated. So whenever I post any external link about newsletter subscription, it doesn't do well. So that is one of the challenges in organic growth. I have tried out paid acquisition channels, which have given me balanced results. I tried out Twitter ads and I've tried out sponsoring other newsletters as well. I tried out cross-posting for organic growth, but that didn't go as well as I wanted it to go. But yeah, it's been up and down. I've tried a bunch of strategies and there have been some successes but not consistently.

[SPEAKER]: So what strategy worked best for you in growing your newsletter?

[SPEAKER]: Posting in communities like Reddit and going to indie hackers worked really well for me initially. And then posting on Twitter and Twitter was doing well, right? Whenever I have a viral tweet, I plug my newsletter under that and I get a bunch of subscribers from there. That is what worked the most. Apart from that, Twitter ads have been alright, but I haven't doubled down on them yet.

[SPEAKER]: Okay, so could you explain why you haven't really doubled down on Twitter ads? Or what's the issue?

[SPEAKER]: I have to crack the monetization aspect, right? I need a working funnel on the back end. Otherwise, what's the point of growing more subscribers if I cannot monetize them effectively? So I'm still testing the right offers and the right way to make it profitable for me.

[SPEAKER]: Could you share with us how many subscribers you have for your newsletter?

[SPEAKER]: At this point, I have 2900 subscribers. And that includes two or three newsletters that I had before, but now I have consolidated all into this one. So yeah, all of them combined are 2900.

"""

    return render_template('step3_results.html', system_results=transcript_content, transcript_content=transcript_content)