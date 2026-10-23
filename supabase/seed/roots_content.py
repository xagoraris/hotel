# Περιεχόμενο Splendour Roots (πρώτη μορφή, για έλεγχο από το ξενοδοχείο).
# Συντεταγμένες κατά προσέγγιση: επαληθεύονται επιτόπου πριν τη χρήση AR.
import json, sys

POIS = [
 # code, cat, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access (walk/car/boat)
 ("hotel", "start", 36.4245, 25.4270, "Splendour · Φηροστεφάνι", "Splendour · Firostefani",
  "Το σημείο εκκίνησης των διαδρομών σας.", "The starting point of your journeys.",
  "Το Φηροστεφάνι («το στεφάνι των Φηρών») απλώνεται στο χείλος της καλντέρας, λίγα λεπτά με τα πόδια βόρεια από τα Φηρά. Από εδώ ξεκινά το μονοπάτι της καλντέρας προς το Ημεροβίγλι και την Οία.",
  "Firostefani (\"the crown of Fira\") sits on the rim of the caldera, a short walk north of Fira. The caldera footpath to Imerovigli and Oia starts right here.",
  None, None, "walk"),
 ("three_bells", "church", 36.4203, 25.4309, "Οι «Τρεις Καμπάνες»", "The \"Three Bells\"",
  "Η καθολική εκκλησία της Κοίμησης της Θεοτόκου με τους μπλε τρούλους.", "The Catholic Church of the Dormition with its blue domes.",
  "Μία από τις πιο φωτογραφημένες εικόνες της Σαντορίνης: η καθολική εκκλησία της Κοίμησης της Θεοτόκου, με τους γαλάζιους τρούλους και το καμπαναριό με τις τρεις καμπάνες, πάνω από την καλντέρα. Επισκεφθείτε την νωρίς το πρωί για ησυχία και μαλακό φως.",
  "One of Santorini's most photographed views: the Catholic Church of the Dormition, with its blue domes and three-bell tower above the caldera. Visit early in the morning for quiet and soft light.",
  None, None, "walk"),
 ("agios_gerasimos", "church", 36.4228, 25.4288, "Άγιος Γεράσιμος", "Agios Gerasimos",
  "Λευκή εκκλησία με σκαλοπάτια προς την καλντέρα.", "A white church with steps down towards the caldera.",
  "Μικρή λευκή εκκλησία στο Φηροστεφάνι, με την αυλή της να κατεβαίνει κλιμακωτά προς την καλντέρα. Χαρακτηριστικό δείγμα της κυκλαδίτικης εκκλησιαστικής αρχιτεκτονικής που συναντάτε σε κάθε γωνιά του νησιού.",
  "A small white church in Firostefani whose courtyard steps down towards the caldera, a typical example of the Cycladic church architecture found all over the island.",
  None, None, "walk"),
 ("orthodox_cathedral", "church", 36.4160, 25.4318, "Μητρόπολη Φηρών (Υπαπαντή)", "Orthodox Cathedral of Fira",
  "Ο μητροπολιτικός ναός της Υπαπαντής στο κέντρο των Φηρών.", "The Metropolitan church of the Presentation of Christ in central Fira.",
  "Ο ορθόδοξος μητροπολιτικός ναός των Φηρών είναι αφιερωμένος στην Υπαπαντή του Χριστού. Ξαναχτίστηκε μετά τον μεγάλο σεισμό του 1956 και στο εσωτερικό του θα δείτε τοιχογραφίες του Σαντορινιού ζωγράφου Χριστόφορου Ασίμη. Η πλατεία μπροστά του έχει θέα στην καλντέρα.",
  "Fira's Orthodox Metropolitan church is dedicated to the Presentation of Christ. It was rebuilt after the great earthquake of 1956, and inside you can see frescoes by the Santorinian painter Christoforos Asimis. Its square looks out over the caldera.",
  None, None, "walk"),
 ("catholic_cathedral", "church", 36.4190, 25.4322, "Καθολικός Καθεδρικός Αγ. Ιωάννη", "Catholic Cathedral of St John",
  "Στην καθολική συνοικία των Φηρών, με το χαρακτηριστικό καμπαναριό.", "In Fira's Catholic quarter, with its distinctive bell tower.",
  "Η Σαντορίνη έχει από τον Μεσαίωνα καθολική κοινότητα, απόηχο της βενετικής περιόδου. Ο καθεδρικός ναός του Αγίου Ιωάννη του Βαπτιστή, στην καθολική συνοικία των Φηρών, ξαναχτίστηκε μετά τον σεισμό του 1956 και ξεχωρίζει για το ροδαλό του καμπαναριό.",
  "Santorini has had a Catholic community since the Middle Ages, an echo of the Venetian period. The Cathedral of St John the Baptist, in Fira's Catholic quarter, was rebuilt after the 1956 earthquake and stands out for its pastel bell tower.",
  None, None, "walk"),
 ("museum_prehistoric", "museum", 36.4170, 25.4310, "Μουσείο Προϊστορικής Θήρας", "Museum of Prehistoric Thera",
  "Τα ευρήματα του Ακρωτηρίου: τοιχογραφίες, αγγεία, το χρυσό αιγαγρό.", "The finds of Akrotiri: wall paintings, pottery, the golden ibex.",
  "Το μουσείο παρουσιάζει την προϊστορία του νησιού και κυρίως τα ευρήματα του Ακρωτηρίου: τοιχογραφίες, έπιπλα που αποτυπώθηκαν στην ηφαιστειακή τέφρα, αγγεία και το μοναδικό χρυσό ειδώλιο αιγάγρου. Ιδανική στάση πριν ή μετά την επίσκεψη στον αρχαιολογικό χώρο.",
  "The museum tells the island's prehistory, above all through the finds from Akrotiri: wall paintings, furniture preserved as casts in the volcanic ash, pottery and the unique golden ibex figurine. An ideal stop before or after visiting the site.",
  "Ελέγξτε το τρέχον ωράριο πριν την επίσκεψη.", "Please check current opening hours before visiting.", "walk"),
 ("museum_archaeological", "museum", 36.4187, 25.4317, "Αρχαιολογικό Μουσείο Θήρας", "Archaeological Museum of Thera",
  "Ευρήματα από την Αρχαία Θήρα, από τη γεωμετρική ως τη ρωμαϊκή εποχή.", "Finds from Ancient Thera, from the Geometric to the Roman period.",
  "Κοντά στον σταθμό του τελεφερίκ, το μουσείο φιλοξενεί γλυπτά, επιγραφές και αγγεία κυρίως από την Αρχαία Θήρα και τα νεκροταφεία της, που καλύπτουν πάνω από χίλια χρόνια ιστορίας μετά την προϊστορική εποχή.",
  "Near the cable car station, the museum holds sculpture, inscriptions and vases mainly from Ancient Thera and its cemeteries, spanning more than a thousand years of history after the prehistoric era.",
  "Ελέγξτε το τρέχον ωράριο πριν την επίσκεψη.", "Please check current opening hours before visiting.", "walk"),
 ("akrotiri", "archaeology", 36.3515, 25.4035, "Προϊστορικός οικισμός Ακρωτηρίου", "Prehistoric Akrotiri",
  "Η «Πομπηία του Αιγαίου», θαμμένη από την έκρηξη της Εποχής του Χαλκού.", "The \"Pompeii of the Aegean\", buried by the Bronze Age eruption.",
  "Μια ακμάζουσα πόλη της Εποχής του Χαλκού, με διώροφα και τριώροφα σπίτια, αποχετεύσεις και εντυπωσιακές τοιχογραφίες, σκεπάστηκε από την ηφαιστειακή τέφρα της μεγάλης έκρηξης του 17ου αιώνα π.Χ. Οι ανασκαφές ξεκίνησαν το 1967 από τον Σπυρίδωνα Μαρινάτο. Δεν έχουν βρεθεί ανθρώπινα λείψανα ούτε πολύτιμα αντικείμενα, γεγονός που δείχνει ότι οι κάτοικοι πρόλαβαν να φύγουν. Σήμερα ο χώρος προστατεύεται από στέγαστρο και η περιήγηση γίνεται σε διαδρόμους πάνω από τους δρόμους της αρχαίας πόλης.",
  "A thriving Bronze Age town, with two- and three-storey houses, drainage systems and remarkable wall paintings, was buried by volcanic ash in the great eruption of the 17th century BC. Excavations began in 1967 under Spyridon Marinatos. No human remains or valuables have been found, which suggests the inhabitants managed to leave in time. Today the site is protected by a roof and you walk on walkways above the streets of the ancient town.",
  "Ελέγξτε το τρέχον ωράριο πριν την επίσκεψη.", "Please check current opening hours before visiting.", "car"),
 ("ancient_thera", "archaeology", 36.3627, 25.4776, "Αρχαία Θήρα", "Ancient Thera",
  "Αρχαία πόλη στην κορυφή του Μέσα Βουνού, ανάμεσα σε Καμάρι και Περίσσα.", "An ancient city on the summit of Mesa Vouno, between Kamari and Perissa.",
  "Χτισμένη σε κορυφογραμμή περίπου 360 μέτρων, η Αρχαία Θήρα ιδρύθηκε από Δωριείς αποίκους και κατοικήθηκε για αιώνες, ως τη ρωμαϊκή και την πρώιμη βυζαντινή εποχή. Θα δείτε την αγορά, ιερά, το θέατρο και σπίτια, με θέα και στις δύο πλευρές του νησιού. Η άνοδος γίνεται με αυτοκίνητο από το Καμάρι και λίγο περπάτημα.",
  "Built on a ridge about 360 metres high, Ancient Thera was founded by Dorian settlers and was inhabited for centuries, into Roman and early Byzantine times. You will see the agora, sanctuaries, the theatre and houses, with views over both sides of the island. Drive up from Kamari and finish on foot.",
  "Ελέγξτε το τρέχον ωράριο πριν την επίσκεψη.", "Please check current opening hours before visiting.", "car"),
 ("caldera_view", "nature", 36.4255, 25.4255, "Θέα στην καλντέρα", "Caldera viewpoint",
  "Η μεγαλύτερη «βουλιαγμένη» ηφαιστειακή λεκάνη του Αιγαίου.", "The great sunken volcanic basin of the Aegean.",
  "Μπροστά σας απλώνεται η καλντέρα: μια τεράστια λεκάνη που σχηματίστηκε όταν, μετά από διαδοχικές εκρήξεις, κατέρρευσε το κέντρο του ηφαιστείου και την πλημμύρισε η θάλασσα. Τα στρώματα στον γκρεμό κάτω από τα πόδια σας (κόκκινα, μαύρα, λευκά) είναι λάβες και τέφρες από διαφορετικές εκρήξεις, σαν σελίδες της γεωλογικής ιστορίας του νησιού.",
  "Before you lies the caldera: a huge basin formed when, after successive eruptions, the centre of the volcano collapsed and the sea flooded in. The bands in the cliff below you (red, black, white) are lavas and ashes from different eruptions, like pages of the island's geological history.",
  None, None, "walk"),
 ("nea_kameni", "nature", 36.4045, 25.3965, "Νέα Καμένη (ηφαίστειο)", "Nea Kameni (the volcano)",
  "Το νεότερο νησί του Αιγαίου, με ενεργούς κρατήρες.", "The youngest island in the Aegean, with active craters.",
  "Η Νέα Καμένη αναδύθηκε από τη θάλασσα στις αρχές του 18ου αιώνα και μεγάλωσε με διαδοχικές εκρήξεις ως το 1950. Ένα μονοπάτι μέσα από μαύρες λάβες οδηγεί στους κρατήρες, όπου σε ορισμένα σημεία βγαίνουν ακόμη θερμά αέρια. Φτάνετε με καραβάκι από το παλιό λιμάνι των Φηρών. Φορέστε κλειστά παπούτσια και πάρτε νερό.",
  "Nea Kameni rose from the sea in the early 18th century and grew through successive eruptions until 1950. A path across black lava leads to the craters, where warm gases still escape in places. Reach it by boat from Fira's old port. Wear closed shoes and bring water.",
  None, None, "boat"),
 ("palea_kameni", "nature", 36.3990, 25.3800, "Θερμές πηγές Παλαιάς Καμένης", "Palea Kameni hot springs",
  "Κολύμπι στα ζεστά, πλούσια σε σίδηρο νερά.", "A swim in warm, iron-rich waters.",
  "Η Παλαιά Καμένη σχηματίστηκε από έκρηξη στα ρωμαϊκά χρόνια. Στον μικρό της κόλπο, θερμά νερά πλούσια σε σίδηρο χρωματίζουν τη θάλασσα πορτοκαλί. Τα περισσότερα καραβάκια για το ηφαίστειο κάνουν στάση εδώ για κολύμπι.",
  "Palea Kameni was formed by an eruption in Roman times. In its small bay, warm iron-rich water turns the sea orange. Most volcano boat trips stop here for a swim.",
  None, None, "boat"),
 ("red_beach", "nature", 36.3487, 25.3945, "Κόκκινη Παραλία", "Red Beach",
  "Κόκκινοι και μαύροι ηφαιστειακοί βράχοι κοντά στο Ακρωτήρι.", "Red and black volcanic cliffs near Akrotiri.",
  "Οι κόκκινοι γκρεμοί της παραλίας είναι ηφαιστειακά πετρώματα πλούσια σε οξείδια του σιδήρου. Θαυμάστε την από το σημείο θέας: λόγω κινδύνου κατολισθήσεων, τηρείτε πάντα τις πινακίδες και μην κάθεστε κάτω από τα βράχια.",
  "The red cliffs are volcanic rock rich in iron oxides. Admire the beach from the viewpoint: because of the risk of rockfalls, always follow the signs and do not sit beneath the cliffs.",
  None, None, "car"),
 ("vlychada", "nature", 36.3378, 25.4245, "Βλυχάδα: τα «φεγγαρένια» βράχια", "Vlychada's \"moonscape\" cliffs",
  "Λευκοί γκρεμοί από ελαφρόπετρα, σμιλεμένοι από τον αέρα.", "White pumice cliffs sculpted by the wind.",
  "Στη νότια ακτή, ο άνεμος έχει σκαλίσει τα στρώματα ελαφρόπετρας και τέφρας σε παράξενα σχήματα που θυμίζουν σεληνιακό τοπίο. Είναι από τα πιο καθαρά σημεία για να δείτε το πάχος της τέφρας που άφησε η μεγάλη έκρηξη της Εποχής του Χαλκού.",
  "On the south coast, the wind has carved the layers of pumice and ash into strange shapes that look like a lunar landscape. It is one of the clearest places to see how thick a blanket of ash the great Bronze Age eruption left behind.",
  None, None, "car"),
 ("perissa", "nature", 36.3555, 25.4770, "Μαύρη παραλία Περίσσας", "Perissa black beach",
  "Μαύρη ηφαιστειακή άμμος κάτω από το Μέσα Βουνό.", "Black volcanic sand beneath Mesa Vouno.",
  "Η μεγάλη παραλία με τη μαύρη ηφαιστειακή άμμο απλώνεται στους πρόποδες του Μέσα Βουνού, του βράχου που δεν είναι ηφαιστειακός αλλά πολύ παλαιότερος ασβεστόλιθος, ένα κομμάτι της αρχικής στεριάς πριν το ηφαίστειο. Η άμμος ζεσταίνεται πολύ το μεσημέρι.",
  "The long black-sand beach stretches beneath Mesa Vouno, a rock that is not volcanic but much older limestone, part of the original land before the volcano. The sand gets very hot at midday.",
  None, None, "car"),
 ("skaros", "castle", 36.4325, 25.4175, "Βράχος Σκάρος (Ημεροβίγλι)", "Skaros Rock (Imerovigli)",
  "Τα ερείπια του μεσαιωνικού κάστρου πάνω από την καλντέρα.", "The ruins of the medieval castle above the caldera.",
  "Πάνω στον βράχο Σκάρο υπήρχε από τον Μεσαίωνα ο κύριος οχυρωμένος οικισμός του νησιού, με το κάστρο, σπίτια και εκκλησίες. Σεισμοί και η διάβρωση οδήγησαν στην εγκατάλειψή του τον 18ο αιώνα και σήμερα σώζονται λίγα ερείπια. Ένα μονοπάτι κατεβαίνει από το Ημεροβίγλι και κάνει τον γύρο του βράχου, ως το εκκλησάκι της Θεοσκέπαστης. Προσοχή στον αέρα και στα σκαλιά.",
  "From the Middle Ages, Skaros Rock held the island's main fortified settlement, with a castle, houses and churches. Earthquakes and erosion led to its abandonment in the 18th century, and only a few ruins survive. A footpath goes down from Imerovigli and around the rock to the chapel of Theoskepasti. Mind the wind and the steps.",
  None, None, "walk"),
 ("caldera_trail", "nature", 36.4330, 25.4210, "Μονοπάτι καλντέρας Φηρά–Οία", "Fira–Oia caldera trail",
  "Περίπου 10 χλμ. στο χείλος της καλντέρας.", "About 10 km along the caldera rim.",
  "Το πιο διάσημο μονοπάτι του νησιού ενώνει τα Φηρά με την Οία μέσα από Φηροστεφάνι και Ημεροβίγλι. Μετά το Ημεροβίγλι γίνεται πιο ανηφορικό και άγριο. Υπολογίστε 3–5 ώρες, ξεκινήστε νωρίς το πρωί, φορέστε κατάλληλα παπούτσια και πάρτε νερό και καπέλο. Μπορείτε να επιστρέψετε με λεωφορείο ή ταξί από την Οία.",
  "The island's most famous footpath links Fira to Oia via Firostefani and Imerovigli. After Imerovigli it becomes steeper and wilder. Allow 3–5 hours, start early in the morning, wear proper shoes and bring water and a hat. You can return from Oia by bus or taxi.",
  None, None, "walk"),
 ("oia_castle", "castle", 36.4612, 25.3727, "Κάστρο της Οίας (Αγ. Νικόλαος)", "Oia castle (Agios Nikolaos)",
  "Ερείπια βενετικού κάστρου και το πιο γνωστό σημείο για το ηλιοβασίλεμα.", "Ruins of a Venetian castle and the island's best-known sunset spot.",
  "Στην άκρη της Οίας σώζονται τα ερείπια του κάστρου του Αγίου Νικολάου, ενός από τα μεσαιωνικά «καστέλια» του νησιού. Σήμερα είναι το πιο δημοφιλές σημείο για το ηλιοβασίλεμα: για θέση, πηγαίνετε τουλάχιστον μία ώρα νωρίτερα, ή απολαύστε το από πιο ήσυχο σημείο του μονοπατιού.",
  "At the tip of Oia stand the ruins of the castle of Agios Nikolaos, one of the island's medieval \"kastelia\". Today it is the most popular sunset spot: arrive at least an hour early for a place, or enjoy the sunset from a quieter point along the path.",
  None, None, "car"),
 ("oia_captains", "architecture", 36.4618, 25.3776, "Καπετανόσπιτα & Ναυτικό Μουσείο Οίας", "Captains' houses & Maritime Museum of Oia",
  "Η ναυτική ιστορία της Οίας.", "The seafaring history of Oia.",
  "Τον 19ο αιώνα η Οία ήταν πλούσιο ναυτικό κέντρο. Οι καπετάνιοι έχτισαν αρχοντικά «καπετανόσπιτα» στο πάνω μέρος του χωριού, ενώ οι ναυτικοί ζούσαν σε υπόσκαφα στην πλαγιά. Το Ναυτικό Μουσείο, σε ένα τέτοιο αρχοντικό, παρουσιάζει αυτή την ιστορία με ομοιώματα πλοίων, όργανα και αρχεία.",
  "In the 19th century Oia was a wealthy seafaring centre. Captains built grand mansions at the top of the village, while sailors lived in cave houses on the slope. The Maritime Museum, in one of these mansions, tells the story through ship models, instruments and archives.",
  "Ελέγξτε το τρέχον ωράριο πριν την επίσκεψη.", "Please check current opening hours before visiting.", "car"),
 ("ammoudi", "nature", 36.4600, 25.3718, "Λιμανάκι Αμμούδι", "Ammoudi Bay",
  "Ψαροταβέρνες στη βάση των κόκκινων βράχων της Οίας.", "Fish tavernas at the foot of Oia's red cliffs.",
  "Κάτω από την Οία, ένα σκαλοπάτι με περίπου 300 σκαλιά κατεβαίνει στο Αμμούδι, ένα μικρό λιμάνι με ψαροταβέρνες ανάμεσα σε κόκκινα ηφαιστειακά βράχια. Η ανάβαση είναι κουραστική τις ζεστές ώρες.",
  "Below Oia, a stairway of around 300 steps leads down to Ammoudi, a small harbour with fish tavernas among red volcanic rocks. The climb back is tiring in the heat of the day.",
  None, None, "car"),
 ("yposkafa", "architecture", 36.4250, 25.4262, "Υπόσκαφα σπίτια", "Cave houses (yposkafa)",
  "Σπίτια σκαμμένα μέσα στο ηφαιστειακό έδαφος.", "Houses dug into the volcanic ground.",
  "Τα υπόσκαφα είναι σπίτια σκαμμένα στα μαλακά στρώματα της ηφαιστειακής τέφρας (θηραϊκή γη). Με ελάχιστη ξυλεία στο νησί, η λύση αυτή ήταν οικονομική και δροσερή το καλοκαίρι, ζεστή τον χειμώνα. Πολλά από τα σημερινά καταλύματα της καλντέρας, όπως στο Φηροστεφάνι, είναι αναπαλαιωμένα υπόσκαφα.",
  "Yposkafa are houses dug into the soft layers of volcanic ash (\"Theran earth\"). With hardly any timber on the island, this was an economical solution, cool in summer and warm in winter. Many of today's caldera hotels, as in Firostefani, are restored cave houses.",
  None, None, "walk"),
 ("pyrgos", "village", 36.3833, 25.4495, "Πύργος Καλλίστης", "Pyrgos Kallistis",
  "Μεσαιωνικό χωριό-καστέλι στην κορυφή λόφου.", "A medieval hilltop village built as a fortified \"kasteli\".",
  "Ο Πύργος ήταν ένα από τα οχυρωμένα «καστέλια» του νησιού: τα σπίτια χτίζονταν το ένα κολλητά στο άλλο, σχηματίζοντας τείχος, με στενά δαιδαλώδη σοκάκια που ανεβαίνουν στην κορυφή. Από εκεί η θέα αγκαλιάζει όλο το νησί. Αξίζει μια βραδινή βόλτα.",
  "Pyrgos was one of the island's fortified \"kastelia\": houses were built wall to wall to form a defensive ring, with narrow winding lanes climbing to the top, from where the view takes in the whole island. Lovely for an evening stroll.",
  None, None, "car"),
 ("megalochori", "village", 36.3747, 25.4265, "Μεγαλοχώρι", "Megalochori",
  "Παραδοσιακό χωριό με καμπαναριά-αψίδες και παλιά οινοποιεία.", "A traditional village with arched bell towers and old wineries.",
  "Το Μεγαλοχώρι διατηρεί τον χαρακτήρα του παλιού αγροτικού χωριού: αρχοντικά, οινοποιεία (κάναβες) και τα χαρακτηριστικά καμπαναριά που περνούν πάνω από τον δρόμο σαν αψίδες. Η κεντρική πλατεία με τα δέντρα είναι ιδανική για καφέ.",
  "Megalochori keeps the character of an old farming village: mansions, traditional wineries (\"kanaves\") and the distinctive bell towers that arch over the lanes. The tree-shaded main square is perfect for a coffee.",
  None, None, "car"),
 ("emporio", "village", 36.3573, 25.4445, "Εμπορείο & Καστέλι", "Emporio & its Kasteli",
  "Το μεγαλύτερο χωριό, με μεσαιωνικό οχυρωμένο πυρήνα.", "The largest village, with a medieval fortified core.",
  "Στο Εμπορείο, το καστέλι (ο οχυρωμένος μεσαιωνικός πυρήνας) σώζεται σε πολύ καλή κατάσταση: στενά περάσματα, σπίτια-τείχος και ο πύργος «Γουλάς». Είναι από τα πιο αυθεντικά μέρη για να καταλάβετε πώς προστατεύονταν οι κάτοικοι από τους πειρατές.",
  "In Emporio the kasteli (the fortified medieval core) survives in very good condition: narrow passages, houses forming a wall and the \"Goulas\" tower. It is one of the most authentic places to understand how islanders protected themselves from pirates.",
  None, None, "car"),
 ("episkopi", "church", 36.3878, 25.4700, "Παναγία Επισκοπή (Μέσα Γωνιά)", "Panagia Episkopi (Mesa Gonia)",
  "Βυζαντινός ναός του 11ου αιώνα.", "An 11th-century Byzantine church.",
  "Ένα από τα σημαντικότερα βυζαντινά μνημεία των Κυκλάδων. Ο ναός χτίστηκε τον 11ο αιώνα και συνδέεται με τον αυτοκράτορα Αλέξιο Α΄ Κομνηνό. Διατηρεί βυζαντινές τοιχογραφίες και φορητές εικόνες, και στις 15 Αυγούστου γιορτάζει με μεγάλο πανηγύρι.",
  "One of the most important Byzantine monuments in the Cyclades. The church was built in the 11th century and is associated with Emperor Alexios I Komnenos. It preserves Byzantine frescoes and icons, and on 15 August it hosts a large feast-day celebration.",
  None, None, "car"),
 ("vineyards", "culture", 36.3880, 25.4440, "Αμπελώνες & «κουλούρα»", "Vineyards & the \"kouloura\"",
  "Τα αμπέλια που πλέκονται σε καλάθι για να αντέχουν τον αέρα.", "Vines woven into baskets to withstand the wind.",
  "Η Σαντορίνη έχει μία από τις παλαιότερες συνεχείς αμπελουργικές παραδόσεις της Ευρώπης. Επειδή φυσάει δυνατά και βρέχει ελάχιστα, τα κλήματα πλέκονται χαμηλά σε σχήμα καλαθιού, την «κουλούρα», που προστατεύει τα σταφύλια και κρατά την υγρασία της νύχτας. Το ηφαιστειακό έδαφος προστάτεψε τα αμπέλια από τη φυλλοξήρα. Δοκιμάστε Ασύρτικο και το γλυκό Vinsanto.",
  "Santorini has one of Europe's oldest continuous winemaking traditions. Because of strong winds and very little rain, the vines are trained low into a basket shape, the \"kouloura\", which shelters the grapes and holds the night-time moisture. The volcanic soil protected the vineyards from phylloxera. Taste Assyrtiko and the sweet Vinsanto.",
  None, None, "car"),
 ("wine_museum", "museum", 36.3940, 25.4435, "Μουσείο Οίνου (Βόθωνας)", "Wine Museum (Vothonas)",
  "Υπόγειο μουσείο για την ιστορία του κρασιού στο νησί.", "An underground museum on the island's wine history.",
  "Σε υπόγειες στοές, το μουσείο αφηγείται την ιστορία του σαντορινιού κρασιού από τον 17ο αιώνα ως σήμερα, με παλιά εργαλεία, πατητήρια και ομοιώματα. Η επίσκεψη συνήθως ολοκληρώνεται με γευσιγνωσία.",
  "In underground galleries, the museum tells the story of Santorini wine from the 17th century to today, with old tools, wine presses and models. Visits usually end with a tasting.",
  "Ελέγξτε το τρέχον ωράριο πριν την επίσκεψη.", "Please check current opening hours before visiting.", "car"),
 ("tomato_museum", "museum", 36.3430, 25.4225, "Βιομηχανικό Μουσείο Τομάτας", "Tomato Industrial Museum",
  "Παλιό εργοστάσιο τοματοπολτού στη Βλυχάδα.", "A former tomato-paste factory in Vlychada.",
  "Η μικρή σαντορινιά ντοματίνα, που μεγαλώνει σχεδόν χωρίς νερό, ήταν για δεκαετίες βασικό προϊόν του νησιού και τροφοδοτούσε εργοστάσια τοματοπολτού. Το μουσείο, σε ένα από αυτά τα παλιά εργοστάσια, δείχνει τα μηχανήματα και τη ζωή των εργατών.",
  "The small Santorini cherry tomato, grown with almost no water, was for decades a key island product supplying tomato-paste factories. The museum, in one of these old factories, shows the machinery and the workers' lives.",
  "Ελέγξτε το τρέχον ωράριο πριν την επίσκεψη.", "Please check current opening hours before visiting.", "car"),
 ("profitis_ilias", "nature", 36.3700, 25.4598, "Προφήτης Ηλίας", "Profitis Ilias",
  "Το ψηλότερο σημείο του νησιού, με το μοναστήρι του 18ου αιώνα.", "The island's highest point, with its 18th-century monastery.",
  "Στα περίπου 560 μέτρα, η κορυφή του Προφήτη Ηλία είναι το ψηλότερο σημείο του νησιού, από ασβεστόλιθο παλαιότερο από το ηφαίστειο. Το μοναστήρι ιδρύθηκε τον 18ο αιώνα. Με καθαρό ουρανό βλέπετε όλη τη Σαντορίνη και τα γύρω νησιά.",
  "At around 560 metres, the summit of Profitis Ilias is the island's highest point, made of limestone older than the volcano. The monastery was founded in the 18th century. On a clear day you can see all of Santorini and the surrounding islands.",
  None, None, "car"),
 ("lighthouse", "nature", 36.3570, 25.3568, "Φάρος Ακρωτηρίου", "Akrotiri lighthouse",
  "Το νοτιοδυτικό άκρο του νησιού, για ήσυχο ηλιοβασίλεμα.", "The island's south-western tip, for a quieter sunset.",
  "Ο πέτρινος φάρος του Ακρωτηρίου, του 19ου αιώνα, στέκεται στην άκρη της καλντέρας. Είναι εναλλακτικό, πιο ήσυχο σημείο για το ηλιοβασίλεμα, με θέα σε όλο το τόξο του νησιού.",
  "The 19th-century stone lighthouse of Akrotiri stands at the end of the caldera. It is a quieter alternative sunset spot, with views along the whole arc of the island.",
  None, None, "car"),
]

ROUTES = [
 # code, icon, color, title_el, title_en, intro_el, intro_en, duration_el, duration_en, mode, stops
 ("volcanic", "🌋", "#eb6834", "Volcanic Roots", "Volcanic Roots",
  "Το ηφαίστειο που έφτιαξε το νησί: η καλντέρα, οι νεαρές λάβες της Νέας Καμένης, τα ζεστά νερά, και οι ακτές με τα κόκκινα, μαύρα και λευκά πετρώματα.",
  "The volcano that made the island: the caldera, the young lavas of Nea Kameni, the warm springs and the shores of red, black and white rock.",
  "1 ημέρα (καραβάκι + αυτοκίνητο)", "1 day (boat + car)", "mixed",
  ["caldera_view", "nea_kameni", "palea_kameni", "red_beach", "vlychada", "perissa"]),
 ("ancient", "🏺", "#2a78d6", "Ancient Roots", "Ancient Roots",
  "Από την πόλη της Εποχής του Χαλκού που έθαψε η τέφρα ως την αρχαία πόλη στην κορυφή του βουνού: δύο μουσεία και δύο αρχαιολογικοί χώροι.",
  "From the Bronze Age town buried by ash to the ancient city on the mountaintop: two museums and two archaeological sites.",
  "1 ημέρα", "1 day", "car",
  ["museum_prehistoric", "akrotiri", "museum_archaeological", "ancient_thera"]),
 ("architectural", "🏛️", "#1baf7a", "Architectural Roots", "Architectural Roots",
  "Υπόσκαφα, μεσαιωνικά καστέλια, καπετανόσπιτα και καμπαναριά: πώς έχτισαν οι Σαντορινιοί για να ζήσουν με τον αέρα, τους σεισμούς και τους πειρατές.",
  "Cave houses, medieval fortified villages, captains' mansions and bell towers: how islanders built to live with the wind, earthquakes and pirates.",
  "1 ημέρα", "1 day", "car",
  ["yposkafa", "skaros", "oia_captains", "oia_castle", "pyrgos", "megalochori", "emporio"]),
 ("cultural", "🍇", "#eda100", "Cultural Roots", "Cultural Roots",
  "Πίστη, κρασί και ντομάτα: εκκλησίες με ιστορία αιώνων, τα αμπέλια-καλάθια, και τα προϊόντα που γέννησε η ξερή ηφαιστειακή γη.",
  "Faith, wine and tomatoes: centuries-old churches, the basket-woven vines and the produce of the dry volcanic soil.",
  "1 ημέρα", "1 day", "car",
  ["orthodox_cathedral", "catholic_cathedral", "episkopi", "vineyards", "wine_museum", "tomato_museum"]),
 ("natural", "🌿", "#e87ba4", "Natural Roots", "Natural Roots",
  "Μονοπάτια, κορυφές και ακρογιαλιές: το μονοπάτι της καλντέρας, ο βράχος του Σκάρου, η ψηλότερη κορυφή και ο φάρος στην άκρη του νησιού.",
  "Paths, peaks and shores: the caldera trail, Skaros Rock, the highest summit and the lighthouse at the island's tip.",
  "1–2 ημέρες", "1–2 days", "mixed",
  ["caldera_trail", "skaros", "ammoudi", "profitis_ilias", "lighthouse", "vlychada"]),
 ("splendour", "✨", "#008300", "Splendour Journey", "Splendour Journey",
  "Μια περιπατητική διαδρομή που ξεκινά από την πόρτα του ξενοδοχείου: οι «Τρεις Καμπάνες», το μονοπάτι της καλντέρας ως τα Φηρά με τις εκκλησίες και τα μουσεία τους, και επιστροφή μέσω Φηροστεφανιού ως τον βράχο του Σκάρου.",
  "A walking route that starts at the hotel door: the \"Three Bells\", the caldera path to Fira with its churches and museums, and back through Firostefani to Skaros Rock.",
  "Μισή ημέρα με τα πόδια", "Half a day on foot", "walk",
  ["hotel", "agios_gerasimos", "three_bells", "orthodox_cathedral", "museum_prehistoric", "museum_archaeological", "yposkafa", "caldera_view", "skaros"]),
]

THEMES = {"volcanic": ["nature"], "ancient": ["archaeology", "museum"], "architectural": ["architecture", "castle", "village"],
          "cultural": ["church", "culture", "museum"], "natural": ["nature"], "splendour": []}

def q(v):
    if v is None: return "null"
    if isinstance(v, (int, float)): return repr(v)
    return "'" + str(v).replace("'", "''") + "'"

def sql():
    out = ["-- Αρχικό περιεχόμενο (πρώτη μορφή για έλεγχο· συντεταγμένες κατά προσέγγιση)",
           "do $seed$", "begin", "  if exists (select 1 from public.roots_pois) then return; end if;"]
    for i, p in enumerate(POIS):
        code, cat, lat, lng, ne, nn, se, sn, be, bn, he, hn, acc = p
        out.append(f"  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ({', '.join(q(x) for x in (code, cat, lat, lng, ne, nn, se, sn, be, bn, he, hn, acc, i + 1))});")
    for i, r in enumerate(ROUTES):
        code, icon, color, te, tn, ie, iN, de, dn, mode, stops = r
        out.append(f"  insert into public.roots_routes (code, icon, color, title_el, title_en, intro_el, intro_en, duration_el, duration_en, mode, sort) values ({', '.join(q(x) for x in (code, icon, color, te, tn, ie, iN, de, dn, mode, i + 1))});")
        for n, s in enumerate(stops):
            out.append(f"  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, {n + 1} from public.roots_routes r, public.roots_pois p where r.code = {q(code)} and p.code = {q(s)};")
    out += ["end $seed$;"]
    return "\n".join(out)

def mock():
    pois = [dict(id=i + 1, code=p[0], category=p[1], lat=p[2], lng=p[3], name_el=p[4], name_en=p[5], short_el=p[6], short_en=p[7],
                 body_el=p[8], body_en=p[9], hours_el=p[10], hours_en=p[11], access=p[12], image_url=None, gallery=[], audio_el_url=None,
                 audio_en_url=None, ar_enabled=False, sort=i + 1, active=True) for i, p in enumerate(POIS)]
    pid = {p["code"]: p["id"] for p in pois}
    routes = [dict(id=i + 1, code=r[0], icon=r[1], color=r[2], title_el=r[3], title_en=r[4], intro_el=r[5], intro_en=r[6],
                   duration_el=r[7], duration_en=r[8], mode=r[9], image_url=None, sort=i + 1, active=True) for i, r in enumerate(ROUTES)]
    stops = [dict(route_id=i + 1, poi_id=pid[s], seq=n + 1, note_el=None, note_en=None) for i, r in enumerate(ROUTES) for n, s in enumerate(r[10])]
    return dict(pois=pois, routes=routes, stops=stops)

if __name__ == "__main__":
    codes = {p[0] for p in POIS}
    for r in ROUTES:
        for s in r[10]: assert s in codes, s
    assert len(codes) == len(POIS)
    if sys.argv[1] == "sql": print(sql())
    else: print(json.dumps(mock(), ensure_ascii=False))
