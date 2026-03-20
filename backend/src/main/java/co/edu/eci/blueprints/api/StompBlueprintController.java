package co.edu.eci.blueprints.api;

import co.edu.eci.blueprints.model.BlueprintSummary;
import co.edu.eci.blueprints.model.BlueprintUpdate;
import co.edu.eci.blueprints.model.DrawEvent;
import co.edu.eci.blueprints.model.Point;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Controller
@ResponseBody
public class StompBlueprintController {

    private final SimpMessagingTemplate template;
    private final Map<String, List<Point>> store = new ConcurrentHashMap<>();

    public StompBlueprintController(SimpMessagingTemplate template) {
        this.template = template;
        store.put("juan:plano-1", new ArrayList<>(List.of(new Point(10, 10), new Point(40, 50))));
        store.put("juan:plano-2", new ArrayList<>(List.of(new Point(5, 5), new Point(100, 100))));
    }

    // GET /api/blueprints?author=juan
    @GetMapping("/api/blueprints")
    public ResponseEntity<?> getByAuthor(@RequestParam String author) {
        List<BlueprintSummary> result = store.entrySet().stream()
                .filter(e -> e.getKey().startsWith(author + ":"))
                .map(e -> {
                    String name = e.getKey().split(":", 2)[1];
                    return new BlueprintSummary(author, name, e.getValue().size());
                })
                .collect(Collectors.toList());

        if (result.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "No blueprints for author: " + author));
        }
        return ResponseEntity.ok(result);
    }

    // GET /api/blueprints/{author}/{name}
    @GetMapping("/api/blueprints/{author}/{name}")
    public ResponseEntity<?> get(@PathVariable String author, @PathVariable String name) {
        String key = author + ":" + name;
        List<Point> points = store.get(key);
        if (points == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Blueprint not found: " + key));
        }
        return ResponseEntity.ok(new BlueprintUpdate(author, name, points));
    }

    // POST /api/blueprints
    @PostMapping("/api/blueprints")
    public ResponseEntity<?> create(@RequestBody BlueprintUpdate bp) {
        String key = bp.author() + ":" + bp.name();
        if (store.containsKey(key)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "Blueprint already exists: " + key));
        }
        store.put(key, new ArrayList<>(bp.points() != null ? bp.points() : List.of()));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new BlueprintUpdate(bp.author(), bp.name(), store.get(key)));
    }

    // PUT /api/blueprints/{author}/{name}
    @PutMapping("/api/blueprints/{author}/{name}")
    public ResponseEntity<?> update(@PathVariable String author, @PathVariable String name,
            @RequestBody BlueprintUpdate bp) {
        String key = author + ":" + name;
        if (!store.containsKey(key)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Blueprint not found: " + key));
        }
        store.put(key, new ArrayList<>(bp.points() != null ? bp.points() : List.of()));
        return ResponseEntity.ok(new BlueprintUpdate(author, name, store.get(key)));
    }

    // DELETE /api/blueprints/{author}/{name}
    @DeleteMapping("/api/blueprints/{author}/{name}")
    public ResponseEntity<?> delete(@PathVariable String author, @PathVariable String name) {
        String key = author + ":" + name;
        if (!store.containsKey(key)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Blueprint not found: " + key));
        }
        store.remove(key);
        return ResponseEntity.ok(Map.of("message", "Deleted: " + key));
    }

    // STOMP /app/draw
    @MessageMapping("/draw")
    public void onDraw(DrawEvent evt) {
        String key = evt.author() + ":" + evt.name();
        store.computeIfAbsent(key, k -> new ArrayList<>()).add(evt.point());
        template.convertAndSend(
                "/topic/blueprints." + evt.author() + "." + evt.name(),
                new BlueprintUpdate(evt.author(), evt.name(), store.get(key)));
    }
}