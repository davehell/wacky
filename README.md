# Divoká kola

Arkádové 3D závody motokár se zvířecími jezdci přímo v prohlížeči. Volně inspirováno DOSovou hrou
Wacky Wheels (1994), ale s moderní grafikou, která vypadá dobře i na velkém monitoru.

Veškerá grafika i zvuk se generují v kódu — žádné obrázky ani nahrávky.

## Spuštění

```
npm install
npm run dev
```

Pak otevři adresu, kterou Vite vypíše (standardně http://localhost:5188).

`npm run build` vytvoří statickou verzi ve složce `dist/`, kterou lze nahrát na jakýkoli hosting
(třeba GitHub Pages).

## Co ve hře je

- šest jezdců — žralok, žirafa, jelen, žabák, zajíček a slonice, každý s jinou rychlostí,
  zrychlením a ovládáním
- tři tratě na tři kola proti pěti soupeřům: Slunečný okruh, Zasněžené údolí s kluzkým ledem
  a sněžením a Pouštní kaňon s písečnými závějemi, které brzdí
- skoky přes můstky na každé trati (po dopadu malé turbo) a hliněná zkratka se seníky, která
  se vyplatí hlavně s turbem
- pohár: všechny tři tratě za sebou, body za umístění (10, 8, 6, 4, 2, 1) a zlatý, stříbrný
  nebo bronzový pohár na konci
- jezdci reagují pohybem hlavy: střelec se zaraduje, soupeř, který tě předjede, se
  ohlédne a zamává, a ten, koho předjedeš, se zarazí
- zasaženému jezdci chvíli krouží kolem hlavy hvězdičky; když zasáhnou tebe, obraz se zatřese
  a zakolébá, zacinkají hvězdičky a tablet krátce zavibruje
- v cíli pódium pro první tři: každé zvíře slaví po svém, padají konfety a vítěz poháru dostane
  zlatý pohár
- v posledním kole zamává uprostřed obrazovky šachovnicová vlajka (hra se obejde bez čtení)
- drift s turbem (modré a oranžové jiskry), raketový start
- ježci na trati jako v původní hře: přejetím je sebereš (až 10) a pak je házíš — kutálí se za soupeřem
  před tebou; každý ježek zrovna něco dělá (sedí na záchodě, čte noviny, spí, hraje na kytaru…)
  a činnosti se střídají
- krabice s otazníkem: oheň (tři ohnivé koule), zmrzlina (past na trati), turbo, bublina (ochrání
  před jedním zásahem), magnet (přitáhne ježky z okolí) a mráček (doletí k vedoucímu jezdci
  a chvíli na něj prší, takže zpomalí)
- třídy 50 / 100 / 150 cc a dětský režim, minimapa, osobní rekordy
- syntetizovaný zvuk motoru s řazením, motory soupeřů s dopplerovým efektem
- veselá hudba v menu a na pódiu, která se skládá přímo ve hře: hlavní motiv zůstává a prostřední
  část se při každém opakování trochu obmění; během jízdy hudba nehraje
- ovládání klávesnicí, gamepadem i dotykem

## Ovládání

| Klávesa              | Akce                                                        |
| -------------------- | ----------------------------------------------------------- |
| ← → / A D            | zatáčení                                                    |
| ↑ ↓ / W S            | plyn, brzda (v dětském režimu jede plyn sám)                |
| Mezerník / Ctrl      | střelba: nejdřív věc z krabice, jinak ježek                 |
| Shift                | drift — drž v zatáčce, puštěním získáš turbo                |
| Esc                  | pauza                                                       |
| M                    | zvuk zapnout / vypnout                                      |
| H                    | hudbu zapnout / vypnout                                     |

Gamepad: RT plyn, LT brzda, RB drift, X nebo Y střelba.

**Dětský režim** (volba v menu): plyn jede sám, řízení je pomalé a plynulé a jemně drží motokáru
na silnici, soupeři jsou pomalejší. Na dotykové obrazovce zůstanou jen tři velká tlačítka:
doleva, doprava a střílej.

## Nápady na další práci

- další tratě (zasněžená, plážová)
- split-screen pro dva hráče
- mód „Shoot the Duck“ z původní hry
- chytřejší soupeři, kteří se vyhýbají pastím
