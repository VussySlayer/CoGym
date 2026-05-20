const url = 'https://script.google.com/macros/s/AKfycbx9Cig5omc0GlZ3aoXQ4rpyxrDKTXQ3nouJMSSUY2h8-IlQjcQEZZ3b4L_mzCxXLZv0/exec';
(async () => {
    try {
        const resp = await fetch(url + '?api=1');
        console.log(await resp.text());

        const resp2 = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ action: 'validate', data: { code: 'X5R4HZ' }})
        });
        const resp3 = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ action: 'getAllSessions', data: {} })
        });
        const json3 = await resp3.json();
        console.log('GetAllSessions count:', json3.data.length);
        if (json3.data.length > 0) {
            const firstId = json3.data[0].id;
            console.log("Deleting session:", firstId);
            const resp4 = await fetch(url, {
                method: 'POST',
                body: JSON.stringify({ action: 'deleteBooking', data: { sessionId: firstId } })
            });
            console.log('Delete res:', await resp4.text());
        }
    } catch(e) { console.error(e) }
})();
