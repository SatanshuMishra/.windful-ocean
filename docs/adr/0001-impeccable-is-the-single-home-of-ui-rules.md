# impeccable is the single home of UI rules, applied by the builder

Every UI rule this setup holds lives in the impeccable skill, whose `standard` path an agent loads by itself while it writes user-interface code, on any platform, and which never asks a question. No other skill, agent, rule or plugin keeps a copy, so the ui-ux-baseline skill was deleted and the code reviewer no longer judges accessibility: the builder applies the standard while writing each element and looks at its own rendered element once after building and once after fixing. A separate UI plugin was rejected because it would be a second home for the same rules, and a UI review stage was rejected because it finds defects after the fact and costs a round each time.

Status: accepted
