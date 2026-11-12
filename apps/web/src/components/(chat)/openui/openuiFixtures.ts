export const OPENUI_FIXTURE = `root = Answer("Choose a hosting plan", [intro, comparison, table, chart, followup])
intro = Paragraph("Illustrative fixture data. This answer uses no model or network requests. Edit the follow-up field, switch examples, and reload to check persistence.")
comparison = Comparison("Your options", [{name: "Starter", description: "A small personal project", benefits: ["Simple setup", "Lower monthly cost"], tradeoffs: ["Less capacity"]}, {name: "Team", description: "A growing shared application", benefits: ["More capacity", "Team access"], tradeoffs: ["Higher monthly cost"]}])
table = DataTable("Plan comparison", ["Plan", "Monthly cost", "Included projects"], [["Starter", "$10", "2"], ["Team", "$30", "10"]])
chart = BarChart("Monthly cost", "USD", [{label: "Starter", value: 10}, {label: "Team", value: 30}])
followup = FollowUp("What matters most for your project?", "priority", "For example: budget, capacity, or collaboration", "Continue")`;

export const OPENUI_EDGE_FIXTURE = `root = Answer("Quarterly change", [intro, chart, followup])
intro = Paragraph("Illustrative values include a decrease and a zero. The values remain readable without color or bar geometry.")
chart = BarChart("Change by quarter", "percent", [{label: "Q1", value: -12}, {label: "Q2", value: 0}, {label: "Q3", value: 18}])
followup = FollowUp("Which quarter should we investigate?", "quarter", "For example: Q1", "Investigate")`;

export const OPENUI_BROKEN_FIXTURE = `root = Answer("Malformed response", [bad])
bad = UnknownComponent("This component is not registered")`;
