from flask_wtf import FlaskForm
from wtforms import StringField, SubmitField, TextAreaField
from flask_wtf.file import FileField, FileAllowed, FileRequired

class LLMParamsForm(FlaskForm):
    goal = TextAreaField('Research Goal', render_kw={"rows": 6, "cols": 11})
    questions = TextAreaField('Research Questions', render_kw={"rows": 6, "cols": 11})
    hypotheses = TextAreaField('Research Hypotheses', render_kw={"rows": 6, "cols": 11})
    interview_transcripts = FileField('Interview Transcripts', validators=[FileAllowed(['txt']), FileRequired()])
    submit = SubmitField('Generate')

class LLMConfidenceForm(FlaskForm):
    question_answer = TextAreaField('Question/Answer Pair', render_kw={"style": "width: 80%"})
    submit = SubmitField('Generate')