// --- 1. PŘIPOJENÍ K MQTT BROKERU (přes zabezpečené WebSockets) ---
const client = mqtt.connect('wss://broker.hivemq.com:8884/mqtt');

client.on('connect', () => {
    console.log('Připojeno k MQTT Brokeru z GitHubu');
    // Přihlásíme se k odběru tématu, kam ESP32 posílá data
    client.subscribe('smart_aqua_cs/data/vystup', (err) => {
        if (!err) {
            console.log('Úspěšně přihlášeno k odběru tématu smart_aqua_cs/data/vystup');
            // Teprve po úspěšném přihlášení si poprvé vyžádáme data
            client.publish('smart_aqua_cs/data/pozadavek', 'updateAll');
        } else {
            console.error('Chyba při přihlášení k odběru:', err);
        }
    });
    
    // Hned po připojení si jednou vyžádáme data
    client.publish('smart_aqua_cs/data/pozadavek', 'updateAll');
});

// --- 2. PRAVIDELNÁ ŽÁDOST O DATA (Náhrada za původní setInterval) ---
// Každých 5 sekund pošleme do ESP32 žádost o nová data
setInterval(() => {
    if (client.connected) {
        client.publish('smart_aqua_cs/data/pozadavek', 'updateAll');
    }
}, 5000);

// --- 3. PŘÍJEM DAT Z ESP32 ---
client.on('message', (topic, payload) => {
    console.log("!!! DOŠLA MQTT ZPRÁVA !!! Téma:", topic);
    if (topic === 'smart_aqua_cs/data/vystup') {
        try {
            // Převedeme text na JSON objekt
            const myObj = JSON.parse(payload.toString());
            console.log("Data z ESP32 úspěšně přijata:", myObj);
            
            // Pomocná funkce pro bezpečný zápis – pokud ID neexistuje, JavaScript nespadne
            const writeValue = (id, value) => {
                const element = document.getElementById(id);
                if (element && value !== undefined) {
                    element.innerHTML = value;
                }
            };
            
            writeValue("tempCover", myObj.tempCover);
            writeValue("humCover", myObj.humCover);
            writeValue("AVled1", myObj.AVled1);
            writeValue("SPled1", myObj.SPled1);
            writeValue("AVled2", myObj.AVled2);
            writeValue("SPled2", myObj.SPled2);
            writeValue("tempWater", myObj.tempWater);
            writeValue("SPtempWater", myObj.SPtempWater);
            writeValue("phWater", myObj.phWater);
            writeValue("SPphWater", myObj.SPphWater);
            writeValue("levelWater", myObj.levelWater);
            writeValue("flowWater", myObj.flowWater);
            writeValue("AVchanges", myObj.AVchgs);
            writeValue("TMchanges", myObj.TMchgs);
            //let tmVal = Number(data.TMchgs);
            //let tmDecimals = (tmVal < 10.0) ? 1 : 0;
            //updateElement("TMchanges", data.TMchgs, tmDecimals);
            writeValue("ntpTime", myObj.ntpTime);
            
            // Zpracování alarmu (pokud existuje prvek alarmNo)
            const alarmEl = document.getElementById("alarmNo");
            if (alarmEl && myObj.alarmNo !== undefined) {
                if (myObj.alarmNo > 0) {
                    alarmEl.style.backgroundColor = "red";
                    alarmEl.innerHTML = "ALARM";
                } else {
                    alarmEl.style.backgroundColor = "green";
                    alarmEl.innerHTML = "OK";
                }
            }

        } catch (e) {
            console.error("Chyba při zpracování JSONu:", e);
        }
    }
});
