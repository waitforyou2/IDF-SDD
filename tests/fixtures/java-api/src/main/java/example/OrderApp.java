package example;

import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@SpringBootApplication
class OrderApp {}

record Order(String id, String state) {}
interface OrderStore { Order find(String id); void save(Order order); }
interface CancellationKeys { boolean claim(String id); }
interface OrderEvents { void cancelled(String id); }

@Service
class Orders {
    private final OrderStore store;
    private final CancellationKeys keys;
    private final OrderEvents events;

    Orders(OrderStore store, CancellationKeys keys, OrderEvents events) {
        this.store = store;
        this.keys = keys;
        this.events = events;
    }

    Order find(String id) { return store.find(id); }

    void cancel(String id) {
        if ("SHIPPED".equals(find(id).state())) throw new ResponseStatusException(HttpStatus.CONFLICT);
        if (keys.claim(id)) {
            store.save(new Order(id, "CANCELLED"));
            events.cancelled(id);
        }
    }
}

@RestController
@RequestMapping("/orders")
class OrderController {
    private final Orders orders;
    OrderController(Orders orders) { this.orders = orders; }

    @GetMapping("/{id}")
    Order find(@PathVariable String id) { return orders.find(id); }

    @PostMapping("/{id}/cancel")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void cancel(@PathVariable String id) { orders.cancel(id); }
}
