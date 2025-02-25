import React, { useState } from 'react';
import { Box, Container, Typography, TextField, Button, MenuItem, Grid, Paper } from '@mui/material';
import { styled } from '@mui/material/styles';

const ContactForm = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(4),
  marginTop: theme.spacing(4),
  [theme.breakpoints.up('md')]: {
    padding: theme.spacing(6)
  }
}));

const Contact = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    service: '',
    message: ''
  });

  const services = [
    'Web Development',
    'SEO Services',
    'Content Creation',
    'Digital Marketing',
    'Other'
  ];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevState => ({
      ...prevState,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Here you would typically handle the form submission
    console.log('Form submitted:', formData);
  };

  return (
    <Box sx={{ py: 8 }}>
      <Container maxWidth="lg">
        <Typography variant="h1" align="center" gutterBottom>
          Contact Us
        </Typography>
        <Typography variant="h5" align="center" color="textSecondary" paragraph sx={{ mb: 4 }}>
          Ready to transform your digital presence? Get in touch with us today.
        </Typography>

        <Grid container spacing={4}>
          <Grid item xs={12} md={6}>
            <Box>
              <Typography variant="h4" gutterBottom color="primary">
                Let's Talk
              </Typography>
              <Typography variant="body1" paragraph>
                Whether you're looking to start a new project or enhance your existing digital presence,
                we're here to help. Fill out the form and we'll get back to you within 24 hours.
              </Typography>
              <Typography variant="body1" paragraph>
                You can also reach us at:
              </Typography>
              <Typography variant="body1" color="primary">
                Email: info@g3zcreative.com
              </Typography>
              <Typography variant="body1" color="primary">
                Phone: (555) 123-4567
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={12} md={6}>
            <ContactForm elevation={2}>
              <form onSubmit={handleSubmit}>
                <Grid container spacing={3}>
                  <Grid item xs={12}>
                    <TextField
                      required
                      fullWidth
                      label="Name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      required
                      fullWidth
                      label="Email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      select
                      fullWidth
                      label="Service Interested In"
                      name="service"
                      value={formData.service}
                      onChange={handleChange}
                    >
                      {services.map((service) => (
                        <MenuItem key={service} value={service}>
                          {service}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      required
                      fullWidth
                      multiline
                      rows={4}
                      label="Message"
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Button
                      type="submit"
                      variant="contained"
                      color="primary"
                      size="large"
                      fullWidth
                    >
                      Send Message
                    </Button>
                  </Grid>
                </Grid>
              </form>
            </ContactForm>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
};

export default Contact;