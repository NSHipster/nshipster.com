document.addEventListener("DOMContentLoaded", function () {
    document.querySelector("button#spookify").onclick = function () {
        if (document.body.className === "") {
            this.textContent = "😱 Too Spooky!"
            document.body.className = "spooky";
            document.querySelector("#spooky-soundtrack").play()
        } else {
            this.textContent = "👻 Spook it Up!"
            document.body.className = "";
            document.querySelector("#spooky-soundtrack").pause()
        }
    };
});
